-- ============================================================================
-- CLASH 2.0 · Phase 13.1 — Live Arena spectator completion
-- ----------------------------------------------------------------------------
-- Gaps closed without new product surface:
--   1. Spectators may join a live room with no stance and read the transcript /
--      evidence / public metadata while still being barred from arguing, voting,
--      reacting, marking evidence useful, recording Mindshift, or earning
--      participation reputation.
--   2. Debater-only write gates on post / react / evidence / useful / final stance
--      (side + argument votes already required role = debater).
--   3. Realtime: guarantee `arena_room_messages` is in `supabase_realtime`
--      (the only table the client subscribes to). Evidence/results stay out of
--      the minimum required set.
-- ============================================================================

-- ── 1. Stance is required for debaters, forbidden for spectators ────────────
alter table public.arena_room_participants
  alter column initial_stance drop not null;

alter table public.arena_room_participants
  drop constraint if exists arena_room_participants_stance_role;

alter table public.arena_room_participants
  add constraint arena_room_participants_stance_role check (
    (role = 'debater' and initial_stance is not null)
    or (role = 'spectator' and initial_stance is null and final_stance is null
        and final_recorded_at is null)
  );

-- ── 2. Membership helpers ───────────────────────────────────────────────────
create or replace function public.arena_is_room_member(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.arena_room_participants p
     where p.room_id = p_room_id
       and p.profile_id = public.my_profile_id()
  );
$$;

/** True when the caller is a debater in the room (not a spectator). */
create or replace function public.arena_is_room_debater(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.arena_room_participants p
     where p.room_id = p_room_id
       and p.profile_id = public.my_profile_id()
       and p.role = 'debater'
  );
$$;

revoke execute on function public.arena_is_room_debater(text) from public;
grant execute on function public.arena_is_room_debater(text) to anon, authenticated;

-- ── 3. join_arena_topic — spectator path (no stance, no capacity slot) ──────
drop function if exists public.join_arena_topic(text, public.take_stance, public.arena_participant_role);

create or replace function public.join_arena_topic(
  p_topic_id text,
  p_stance   public.take_stance default null,
  p_role     public.arena_participant_role default 'debater'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     text := public.my_profile_id();
  v_topic    public.arena_daily_topics%rowtype;
  v_existing public.arena_room_participants%rowtype;
  v_room     public.arena_rooms%rowtype;
  v_room_id  text;
  v_role     public.arena_participant_role := coalesce(p_role, 'debater');
begin
  if v_user is null then
    raise exception 'sign in to join the Arena' using errcode = '42501';
  end if;

  if v_role = 'debater' then
    if p_stance is null then
      raise exception 'pick a stance to join' using errcode = 'P0003';
    end if;
  elsif p_stance is not null then
    -- Spectators do not record a private stance; ignore would hide a client bug.
    raise exception 'spectators do not record a stance' using errcode = 'P0003';
  end if;

  select * into v_topic
    from public.arena_daily_topics
   where id = p_topic_id
     for update;
  if not found then
    raise exception 'topic does not exist' using errcode = 'P0002';
  end if;

  if v_topic.status <> 'live' then
    raise exception 'topic is not live' using errcode = 'P0003';
  end if;
  if now() < v_topic.opens_at then
    raise exception 'topic has not opened yet' using errcode = 'P0003';
  end if;
  if now() >= v_topic.closes_at then
    raise exception 'topic is closed' using errcode = 'P0003';
  end if;

  -- Already in: hand back the existing membership; never change role/stance.
  select * into v_existing
    from public.arena_room_participants
   where topic_id = p_topic_id and profile_id = v_user;
  if found then
    select * into v_room from public.arena_rooms where id = v_existing.room_id;
    return jsonb_build_object(
      'joined', false,
      'roomId', v_existing.room_id,
      'topicId', p_topic_id,
      'stance', v_existing.initial_stance,
      'role', v_existing.role,
      'status', v_room.status,
      'capacity', v_room.capacity,
      'participantCount', v_room.participant_count,
      'joinedAt', v_existing.joined_at
    );
  end if;

  perform public.assert_rate_limit(v_user, 'arena_room_join', 20, interval '1 hour');

  if v_role = 'spectator' then
    -- Watch any active room for this topic; prefer the busiest OPEN room.
    -- Spectators do not consume debater capacity.
    select * into v_room
      from public.arena_rooms r
     where r.topic_id = p_topic_id
       and r.status in ('OPEN', 'FINAL_ARGUMENTS', 'JUDGING')
     order by
       case r.status
         when 'OPEN' then 0
         when 'FINAL_ARGUMENTS' then 1
         else 2
       end,
       r.participant_count desc,
       r.created_at asc,
       r.id asc
     limit 1
       for update;

    if not found then
      v_room_id := public.new_arena_id('ar_');
      insert into public.arena_rooms (
        id, topic_id, status, capacity, participant_count, opens_at, closes_at
      ) values (
        v_room_id, p_topic_id, 'OPEN', 40, 0,
        greatest(v_topic.opens_at, now()), v_topic.closes_at
      )
      returning * into v_room;
    end if;

    insert into public.arena_room_participants (
      room_id, topic_id, profile_id, initial_stance, role
    ) values (
      v_room.id, p_topic_id, v_user, null, 'spectator'
    )
    returning * into v_existing;
  else
    -- Debater placement: oldest non-full OPEN room, else create.
    select * into v_room
      from public.arena_rooms r
     where r.topic_id = p_topic_id
       and r.status = 'OPEN'
       and r.participant_count < r.capacity
     order by r.created_at asc, r.id asc
     limit 1
       for update;

    if not found then
      v_room_id := public.new_arena_id('ar_');
      insert into public.arena_rooms (
        id, topic_id, status, capacity, participant_count, opens_at, closes_at
      ) values (
        v_room_id, p_topic_id, 'OPEN', 40, 0,
        greatest(v_topic.opens_at, now()), v_topic.closes_at
      )
      returning * into v_room;
    end if;

    insert into public.arena_room_participants (
      room_id, topic_id, profile_id, initial_stance, role
    ) values (
      v_room.id, p_topic_id, v_user, p_stance, 'debater'
    )
    returning * into v_existing;

    update public.arena_rooms
       set participant_count = participant_count + 1
     where id = v_room.id
    returning * into v_room;
  end if;

  return jsonb_build_object(
    'joined', true,
    'roomId', v_room.id,
    'topicId', p_topic_id,
    'stance', v_existing.initial_stance,
    'role', v_existing.role,
    'status', v_room.status,
    'capacity', v_room.capacity,
    'participantCount', v_room.participant_count,
    'joinedAt', v_existing.joined_at
  );
end;
$$;

revoke execute on function public.join_arena_topic(text, public.take_stance, public.arena_participant_role)
  from public, anon;
grant execute on function public.join_arena_topic(text, public.take_stance, public.arena_participant_role)
  to authenticated;

-- ── 4. Debater-only write gates ─────────────────────────────────────────────
-- Spectators remain members for read/list RPCs + RLS, but cannot mutate.

create or replace function public.post_arena_room_message(
  p_room_id           text,
  p_body              text,
  p_parent_message_id text default null,
  p_media_object_id   text default null,
  p_media_url         text default null,
  p_gif_provider      text default null,
  p_gif_external_id   text default null
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
  v_media  public.media_objects%rowtype;
  v_parent public.arena_room_messages%rowtype;
  v_is_gif boolean := p_gif_provider is not null or p_gif_external_id is not null;
  v_kind   public.arena_message_kind;
  v_row    public.arena_room_messages%rowtype;
begin
  if v_author is null then
    raise exception 'sign in to argue' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_is_room_member(p_room_id) then
    raise exception 'join the room to argue' using errcode = '42501';
  end if;
  if not public.arena_is_room_debater(p_room_id) then
    raise exception 'spectators cannot post' using errcode = '42501';
  end if;
  if v_room.status not in ('OPEN', 'FINAL_ARGUMENTS') then
    raise exception 'the room is not accepting arguments' using errcode = 'P0003';
  end if;

  if char_length(v_body) > 500 then
    raise exception 'an argument must be at most 500 characters' using errcode = 'P0003';
  end if;
  if v_is_gif and p_media_object_id is not null then
    raise exception 'choose either an upload or a gif, not both' using errcode = 'P0003';
  end if;
  if v_body = '' and p_media_object_id is null and not v_is_gif then
    raise exception 'an argument needs text or media' using errcode = 'P0003';
  end if;

  if v_is_gif then
    if p_gif_provider is distinct from 'tenor' then
      raise exception 'unsupported gif provider' using errcode = 'P0003';
    end if;
    if p_gif_external_id is null or btrim(p_gif_external_id) = ''
       or char_length(p_gif_external_id) > 64 then
      raise exception 'gif id is required' using errcode = 'P0003';
    end if;
    if p_gif_external_id !~ '^[A-Za-z0-9_-]+$' then
      raise exception 'gif id is invalid' using errcode = 'P0003';
    end if;
    if not public.is_allowed_tenor_media_url(p_media_url) then
      raise exception 'gif url is not an allowed tenor host' using errcode = 'P0005';
    end if;
    v_kind := 'gif';
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
      raise exception 'arena arguments must use public media' using errcode = 'P0005';
    end if;
    if v_media.media_kind not in ('image', 'video') then
      raise exception 'unsupported media kind' using errcode = 'P0003';
    end if;
    if p_media_url is null or btrim(p_media_url) = '' then
      raise exception 'media url is required' using errcode = 'P0003';
    end if;
    v_kind := 'media';
  else
    v_kind := 'text';
  end if;

  if p_parent_message_id is not null then
    select * into v_parent
      from public.arena_room_messages where id = p_parent_message_id;
    if not found or v_parent.room_id <> p_room_id then
      raise exception 'parent argument is not in this room' using errcode = 'P0002';
    end if;
    if v_parent.hidden_at is not null then
      raise exception 'parent argument is not available' using errcode = 'P0003';
    end if;
    if public.arena_actor_hidden(v_author, v_parent.author_id) then
      raise exception 'blocked' using errcode = 'P0005';
    end if;
  end if;

  perform public.assert_rate_limit(v_author, 'arena_room_message', 30, interval '10 minutes');

  insert into public.arena_room_messages (
    id, room_id, author_id, kind, body, parent_message_id,
    media_object_id, media_url, media_kind, gif_provider, gif_external_id
  ) values (
    public.new_arena_id('am_'),
    p_room_id,
    v_author,
    v_kind,
    v_body,
    p_parent_message_id,
    case when v_kind = 'media' then p_media_object_id else null end,
    case when v_kind = 'text' then null else p_media_url end,
    case
      when v_kind = 'gif' then 'gif'::public.media_kind
      when v_kind = 'media' then v_media.media_kind
      else null
    end,
    case when v_kind = 'gif' then 'tenor' else null end,
    case when v_kind = 'gif' then p_gif_external_id else null end
  )
  returning * into v_row;

  return next v_row;
end;
$$;

create or replace function public.react_arena_room_message(
  p_message_id text,
  p_emoji      text default '🔥'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    text := public.my_profile_id();
  v_emoji   text := coalesce(btrim(p_emoji), '');
  v_msg     public.arena_room_messages%rowtype;
  v_room    public.arena_rooms%rowtype;
  v_reacted boolean;
  v_count   integer;
begin
  if v_user is null then
    raise exception 'sign in to react' using errcode = '42501';
  end if;
  if v_emoji = '' or char_length(v_emoji) > 8 then
    raise exception 'pick a single reaction' using errcode = 'P0003';
  end if;

  select * into v_msg from public.arena_room_messages where id = p_message_id;
  if not found then
    raise exception 'argument does not exist' using errcode = 'P0002';
  end if;
  if v_msg.hidden_at is not null then
    raise exception 'argument is not available' using errcode = 'P0003';
  end if;
  if not public.arena_is_room_member(v_msg.room_id) then
    raise exception 'join the room to react' using errcode = '42501';
  end if;
  if not public.arena_is_room_debater(v_msg.room_id) then
    raise exception 'spectators cannot react' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = v_msg.room_id;
  if v_room.status in ('SETTLED', 'CANCELLED') then
    raise exception 'the room is closed' using errcode = 'P0003';
  end if;
  if public.arena_actor_hidden(v_user, v_msg.author_id) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  perform public.assert_rate_limit(v_user, 'arena_room_react', 60, interval '10 minutes');

  delete from public.arena_room_message_reactions
   where message_id = p_message_id and profile_id = v_user and emoji = v_emoji;

  if found then
    v_reacted := false;
  else
    insert into public.arena_room_message_reactions (message_id, profile_id, emoji)
    values (p_message_id, v_user, v_emoji);
    v_reacted := true;
  end if;

  select count(*)::integer into v_count
    from public.arena_room_message_reactions
   where message_id = p_message_id and emoji = v_emoji;

  return jsonb_build_object(
    'messageId', p_message_id,
    'emoji', v_emoji,
    'reacted', v_reacted,
    'count', v_count
  );
end;
$$;

create or replace function public.submit_arena_evidence(
  p_room_id         text,
  p_kind            public.arena_evidence_kind,
  p_title           text,
  p_source_url      text default null,
  p_media_object_id text default null,
  p_media_url       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author text := public.my_profile_id();
  v_title  text := btrim(coalesce(p_title, ''));
  v_room   public.arena_rooms%rowtype;
  v_media  public.media_objects%rowtype;
  v_row    public.arena_room_evidence%rowtype;
begin
  if v_author is null then
    raise exception 'sign in to add evidence' using errcode = '42501';
  end if;
  if p_kind is null then
    raise exception 'evidence kind is required' using errcode = 'P0003';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 140 then
    raise exception 'evidence needs a title of 1–140 characters' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if not public.arena_is_room_member(p_room_id) then
    raise exception 'join the room to add evidence' using errcode = '42501';
  end if;
  if not public.arena_is_room_debater(p_room_id) then
    raise exception 'spectators cannot upload evidence' using errcode = '42501';
  end if;
  if v_room.status not in ('OPEN', 'FINAL_ARGUMENTS') then
    raise exception 'the room is not accepting evidence' using errcode = 'P0003';
  end if;

  if p_kind = 'link' then
    if p_media_object_id is not null or p_media_url is not null then
      raise exception 'a link citation cannot carry an upload' using errcode = 'P0003';
    end if;
    if not public.is_allowed_http_url(p_source_url) then
      raise exception 'evidence link must be a public https url' using errcode = 'P0005';
    end if;
  else
    if p_source_url is not null then
      raise exception 'an upload citation cannot carry a source url' using errcode = 'P0003';
    end if;
    if p_media_object_id is null then
      raise exception 'evidence media is required' using errcode = 'P0003';
    end if;
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
      raise exception 'arena evidence must use public media' using errcode = 'P0005';
    end if;
    if v_media.media_kind::text <> p_kind::text then
      raise exception 'evidence kind does not match the upload' using errcode = 'P0003';
    end if;
    if p_media_url is null or btrim(p_media_url) = '' then
      raise exception 'media url is required' using errcode = 'P0003';
    end if;
  end if;

  perform public.assert_rate_limit(v_author, 'arena_evidence', 8, interval '1 hour');

  insert into public.arena_room_evidence (
    id, room_id, topic_id, author_id, kind, title,
    source_url, media_object_id, media_url
  ) values (
    public.new_arena_id('ae_'),
    p_room_id,
    v_room.topic_id,
    v_author,
    p_kind,
    v_title,
    case when p_kind = 'link' then p_source_url else null end,
    case when p_kind = 'link' then null else p_media_object_id end,
    case when p_kind = 'link' then null else p_media_url end
  )
  returning * into v_row;

  return public.arena_evidence_payload(v_row, v_author);
end;
$$;

create or replace function public.mark_arena_evidence_useful(p_evidence_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   text := public.my_profile_id();
  v_ev     public.arena_room_evidence%rowtype;
  v_room   public.arena_rooms%rowtype;
  v_marked boolean;
  v_count  integer;
begin
  if v_user is null then
    raise exception 'sign in to mark evidence' using errcode = '42501';
  end if;

  select * into v_ev from public.arena_room_evidence where id = p_evidence_id for update;
  if not found then
    raise exception 'evidence does not exist' using errcode = 'P0002';
  end if;
  if v_ev.hidden_at is not null then
    raise exception 'evidence is not available' using errcode = 'P0003';
  end if;
  if v_ev.author_id = v_user then
    raise exception 'you cannot mark your own evidence useful' using errcode = 'P0001';
  end if;
  if not public.arena_is_room_member(v_ev.room_id) then
    raise exception 'join the room to mark evidence' using errcode = '42501';
  end if;
  if not public.arena_is_room_debater(v_ev.room_id) then
    raise exception 'spectators cannot mark evidence' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = v_ev.room_id;
  if v_room.status in ('SETTLED', 'CANCELLED') then
    raise exception 'the room is closed' using errcode = 'P0003';
  end if;

  perform public.assert_rate_limit(v_user, 'arena_evidence_mark', 60, interval '10 minutes');

  delete from public.arena_room_evidence_marks
   where evidence_id = p_evidence_id and profile_id = v_user;

  if found then
    v_marked := false;
  else
    insert into public.arena_room_evidence_marks (evidence_id, profile_id)
    values (p_evidence_id, v_user);
    v_marked := true;
  end if;

  select count(*)::integer into v_count
    from public.arena_room_evidence_marks where evidence_id = p_evidence_id;

  update public.arena_room_evidence
     set useful_count = v_count
   where id = p_evidence_id;

  return jsonb_build_object(
    'evidenceId', p_evidence_id,
    'marked', v_marked,
    'usefulCount', v_count
  );
end;
$$;

create or replace function public.record_arena_final_stance(
  p_room_id text,
  p_stance  public.take_stance
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_room public.arena_rooms%rowtype;
  v_part public.arena_room_participants%rowtype;
  v_changed boolean;
begin
  if v_user is null then
    raise exception 'sign in to record a stance' using errcode = '42501';
  end if;
  if p_stance is null then
    raise exception 'pick a stance' using errcode = 'P0003';
  end if;

  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found then
    raise exception 'room does not exist' using errcode = 'P0002';
  end if;
  if v_room.status <> 'SETTLED' then
    raise exception 'the room has not settled yet' using errcode = 'P0003';
  end if;

  select * into v_part
    from public.arena_room_participants
   where room_id = p_room_id and profile_id = v_user
     for update;
  if not found then
    raise exception 'you were not in this room' using errcode = 'P0007';
  end if;
  if v_part.role <> 'debater' or v_part.initial_stance is null then
    raise exception 'spectators cannot record a stance' using errcode = '42501';
  end if;
  if v_part.final_stance is not null then
    raise exception 'final stance already recorded' using errcode = 'P0008';
  end if;

  v_changed := v_part.initial_stance <> p_stance;

  update public.arena_room_participants
     set final_stance = p_stance,
         final_recorded_at = now()
   where room_id = p_room_id and profile_id = v_user
  returning * into v_part;

  update public.arena_room_results
     set mindshift_completed_count = mindshift_completed_count + 1,
         mindshift_changed_count = mindshift_changed_count + case when v_changed then 1 else 0 end
   where room_id = p_room_id;

  return jsonb_build_object(
    'roomId', p_room_id,
    'initialStance', v_part.initial_stance,
    'finalStance', v_part.final_stance,
    'finalRecordedAt', v_part.final_recorded_at,
    'changed', v_changed
  );
end;
$$;

revoke execute on function public.post_arena_room_message(text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.post_arena_room_message(text, text, text, text, text, text, text)
  to authenticated;

revoke execute on function public.react_arena_room_message(text, text) from public, anon;
grant execute on function public.react_arena_room_message(text, text) to authenticated;

revoke execute on function public.submit_arena_evidence(
  text, public.arena_evidence_kind, text, text, text, text
) from public, anon;
grant execute on function public.submit_arena_evidence(
  text, public.arena_evidence_kind, text, text, text, text
) to authenticated;

revoke execute on function public.mark_arena_evidence_useful(text) from public, anon;
grant execute on function public.mark_arena_evidence_useful(text) to authenticated;

revoke execute on function public.record_arena_final_stance(text, public.take_stance)
  from public, anon;
grant execute on function public.record_arena_final_stance(text, public.take_stance)
  to authenticated;

-- ── 5. Realtime publication (minimum: messages only) ────────────────────────
do $$ begin
  alter publication supabase_realtime drop table public.arena_room_evidence;
exception
  when undefined_object then null;
  when undefined_table then null;
  when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime drop table public.arena_room_results;
exception
  when undefined_object then null;
  when undefined_table then null;
  when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.arena_room_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when others then null;
end $$;
