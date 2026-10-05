-- ============================================================================
-- CLASH 2.0 · Phase 15.5 — Creator AI (RPC surface)
-- ----------------------------------------------------------------------------
-- Reads project only viewer-safe fields; writes are creator-owned or
-- service-only. Two rules are worth stating twice:
--   · `instructions` never leaves the database through a viewer-facing RPC.
--   · the assistant turn is written by `creator_ai_finish_turn`, which no client
--     may execute. A client cannot fabricate an AI reply.
-- ============================================================================

-- ── 1. Viewer-safe profile card ────────────────────────────────────────────
create or replace function public.creator_ai_profile_card(
  p_creator_id text,
  p_viewer     text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.creator_ai_profiles%rowtype;
  v_creator public.profiles%rowtype;
  v_media public.media_objects%rowtype;
  v_access boolean;
  v_owner boolean := p_viewer is not null and p_viewer = p_creator_id;
  v_starters jsonb := '[]'::jsonb;
begin
  select * into v from public.creator_ai_profiles where creator_id = p_creator_id;
  if not found then
    return null;
  end if;
  select * into v_creator from public.profiles where id = p_creator_id;
  if v.artwork_media_object_id is not null then
    select * into v_media from public.media_objects where id = v.artwork_media_object_id;
  end if;

  -- Suggested prompts are presentation data, but still bounded and coerced.
  select coalesce(jsonb_agg(entry), '[]'::jsonb) into v_starters
    from (
      select e as entry
        from jsonb_array_elements(v.starters) e
       where jsonb_typeof(e) = 'string' and char_length(e #>> '{}') between 1 and 120
       limit 6
    ) t;

  v_access := public.creator_ai_viewer_can_access(p_creator_id, p_viewer);

  return jsonb_build_object(
    'creatorId', v.creator_id,
    'creatorName', v_creator.name,
    'creatorHandle', v_creator.handle,
    'creatorTint', v_creator.avatar_tint,
    'displayName', v.display_name,
    'description', v.description,
    'welcomeMessage', v.welcome_message,
    'access', v.access,
    'enabled', v.enabled,
    'starters', v_starters,
    'artwork', case
      when v_media.id is null or v_media.status <> 'ready' or v_media.deleted_at is not null then null
      else jsonb_build_object('bucket', v_media.bucket, 'path', v_media.storage_path, 'kind', v_media.media_kind)
    end,
    'viewerAccess', v_access,
    'canChat', v_access and not v_owner and p_viewer is not null,
    'isOwner', v_owner
  );
end;
$$;

revoke execute on function public.creator_ai_profile_card(text, text) from public, anon, authenticated;

/** The Creator AI room for a viewer. Null when disabled or not permitted. */
create or replace function public.get_creator_ai(p_creator_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_card   jsonb;
begin
  if p_creator_id is null then
    return null;
  end if;
  v_card := public.creator_ai_profile_card(p_creator_id, v_viewer);
  if v_card is null then
    return null;
  end if;
  -- Switching the AI off removes it from the world for everyone but its owner
  -- (who reads the configuration through `get_my_creator_ai`) and staff.
  if (v_card ->> 'enabled')::boolean is not true
     and v_viewer is distinct from p_creator_id
     and not public.is_staff() then
    return null;
  end if;
  return v_card;
end;
$$;

revoke execute on function public.get_creator_ai(text) from public;
grant execute on function public.get_creator_ai(text) to anon, authenticated;

/** The creator's own configuration, including private instructions. */
create or replace function public.get_my_creator_ai()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v public.creator_ai_profiles%rowtype;
  v_media public.media_objects%rowtype;
begin
  if v_creator is null then
    return null;
  end if;
  select * into v from public.creator_ai_profiles where creator_id = v_creator;
  if not found then
    return jsonb_build_object('hasProfile', false);
  end if;
  if v.artwork_media_object_id is not null then
    select * into v_media from public.media_objects where id = v.artwork_media_object_id;
  end if;

  return jsonb_build_object(
    'hasProfile', true,
    'enabled', v.enabled,
    'displayName', v.display_name,
    'description', v.description,
    'welcomeMessage', v.welcome_message,
    'instructions', v.instructions,
    'access', v.access,
    'starters', v.starters,
    'artworkMediaObjectId', v.artwork_media_object_id,
    'artwork', case
      when v_media.id is null or v_media.status <> 'ready' or v_media.deleted_at is not null then null
      else jsonb_build_object('bucket', v_media.bucket, 'path', v_media.storage_path, 'kind', v_media.media_kind)
    end,
    'knowledge', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id,
               'kind', k.kind,
               'title', k.title,
               'body', k.body,
               'sourceId', k.source_id,
               'access', k.access,
               'createdAt', k.created_at
             ) order by k.created_at desc)
        from (select * from public.creator_ai_knowledge where creator_id = v_creator limit 60) k
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_my_creator_ai() from public, anon;
grant execute on function public.get_my_creator_ai() to authenticated;

-- ── 2. Creator configuration ───────────────────────────────────────────────
create or replace function public.upsert_creator_ai_profile(
  p_display_name    text,
  p_description     text default '',
  p_welcome_message text default '',
  p_instructions    text default '',
  p_access          public.creator_ai_access default 'FREE',
  p_starters        jsonb default '[]'::jsonb,
  p_enabled         boolean default true,
  p_artwork_media_object_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_name    text := coalesce(trim(p_display_name), '');
  v_desc    text := coalesce(trim(p_description), '');
  v_welcome text := coalesce(trim(p_welcome_message), '');
  v_instr   text := coalesce(trim(p_instructions), '');
  v_starters jsonb := coalesce(p_starters, '[]'::jsonb);
  v_media   public.media_objects%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_creator, 'creator_ai_config', 30, interval '1 hour');

  if not exists (select 1 from public.creator_vaults where creator_id = v_creator and status = 'active') then
    raise exception 'open your vault first' using errcode = 'P0006';
  end if;
  if v_name = '' or char_length(v_name) > 40 then
    raise exception 'an AI display name must be 1-40 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 300 or char_length(v_welcome) > 500 or char_length(v_instr) > 4000 then
    raise exception 'that field is too long' using errcode = 'P0003';
  end if;
  if jsonb_typeof(v_starters) <> 'array' or jsonb_array_length(v_starters) > 6 then
    raise exception 'suggested prompts must be a list of up to six' using errcode = 'P0003';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_starters) e
     where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') not between 1 and 120
  ) then
    raise exception 'each suggested prompt must be 1-120 characters' using errcode = 'P0003';
  end if;

  -- A display name may never be bare impersonation: it must read as an AI.
  if lower(v_name) in (select lower(coalesce(name, '')) from public.profiles where id = v_creator) then
    raise exception 'name the AI as an AI, for example "Maya AI"' using errcode = 'P0003';
  end if;

  if p_artwork_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_artwork_media_object_id;
    if v_media.id is null or v_media.owner_id is distinct from v_creator
       or v_media.status is distinct from 'ready' or v_media.deleted_at is not null
       or v_media.visibility is distinct from 'public' or v_media.bucket is distinct from 'public-media' then
      raise exception 'attach a finished public upload you own' using errcode = 'P0004';
    end if;
  end if;

  insert into public.creator_ai_profiles (
    creator_id, enabled, display_name, description, welcome_message, instructions,
    access, starters, artwork_media_object_id, updated_at
  ) values (
    v_creator, p_enabled, v_name, v_desc, v_welcome, v_instr,
    p_access, v_starters, p_artwork_media_object_id, now()
  )
  on conflict (creator_id) do update
    set enabled = excluded.enabled,
        display_name = excluded.display_name,
        description = excluded.description,
        welcome_message = excluded.welcome_message,
        instructions = excluded.instructions,
        access = excluded.access,
        starters = excluded.starters,
        artwork_media_object_id = excluded.artwork_media_object_id,
        updated_at = now();

  return public.get_my_creator_ai();
end;
$$;

revoke execute on function public.upsert_creator_ai_profile(text, text, text, text, public.creator_ai_access, jsonb, boolean, text) from public, anon;
grant execute on function public.upsert_creator_ai_profile(text, text, text, text, public.creator_ai_access, jsonb, boolean, text) to authenticated;


-- ── 3. Creator-approved knowledge ──────────────────────────────────────────
-- A note is creator-written text. Everything else POINTS at CLASH content the
-- creator owns, and inherits that content's access level so retrieval can
-- require the viewer's entitlement. Nothing is ever ingested silently.
create or replace function public.add_creator_ai_knowledge(
  p_kind      public.creator_ai_knowledge_kind,
  p_title     text,
  p_body      text default null,
  p_source_id text default null,
  p_access    public.creator_ai_access default 'FREE'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_title   text := coalesce(trim(p_title), '');
  v_body    text := nullif(trim(coalesce(p_body, '')), '');
  v_access  public.creator_ai_access := p_access;
  v_id      text;
  v_drop    public.vault_drops%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_creator, 'creator_ai_knowledge', 60, interval '1 hour');

  if p_kind = 'NOTE' then
    if v_body is null or char_length(v_body) > 4000 then
      raise exception 'a knowledge note must be 1-4000 characters' using errcode = 'P0003';
    end if;
    if p_source_id is not null then
      raise exception 'a note cannot also point at content' using errcode = 'P0003';
    end if;
    if v_title = '' then
      v_title := left(v_body, 60);
    end if;
  elsif p_kind = 'VAULT_DROP' then
    if p_source_id is null then
      raise exception 'choose a Drop' using errcode = 'P0003';
    end if;
    select * into v_drop from public.vault_drops where id = p_source_id;
    if not found then
      raise exception 'that Drop does not exist' using errcode = 'P0004';
    end if;
    if v_drop.creator_id <> v_creator then
      raise exception 'that Drop is not yours' using errcode = 'P0001';
    end if;
    if v_drop.status <> 'published' or v_drop.deleted_at is not null then
      raise exception 'only your published Drops can teach the AI' using errcode = 'P0004';
    end if;
    v_access := (case when v_drop.access_level = 'free' then 'FREE' else 'SUBSCRIBER' end)::public.creator_ai_access;
    if v_title = '' then
      v_title := v_drop.caption;
    end if;
    v_body := null;
  elsif p_kind = 'COLLECTION' then
    if p_source_id is null then
      raise exception 'choose a Collection' using errcode = 'P0003';
    end if;
    if not exists (
      select 1 from public.vault_collections where id = p_source_id and creator_id = v_creator
    ) then
      raise exception 'that Collection is not yours' using errcode = 'P0001';
    end if;
    -- The strictest item decides: a member-only item makes the whole entry
    -- member-only, so a free viewer can never reach gated text.
    v_access := (case when exists (
      select 1
        from public.vault_collection_items i
        join public.vault_drops d on d.id = i.drop_id
       where i.collection_id = p_source_id and d.access_level = 'subscriber'
    ) then 'SUBSCRIBER' else 'FREE' end)::public.creator_ai_access;
    if v_title = '' then
      select title into v_title from public.vault_collections where id = p_source_id;
    end if;
    v_body := null;
  else
    if p_source_id is null then
      raise exception 'choose a course' using errcode = 'P0003';
    end if;
    if not exists (
      select 1 from public.creator_courses
       where id = p_source_id and creator_id = v_creator
         and access_type in ('free', 'subscriber')
    ) then
      raise exception 'that course cannot teach the AI' using errcode = 'P0001';
    end if;
    v_access := (case when exists (
      select 1 from public.creator_courses where id = p_source_id and access_type = 'subscriber'
    ) then 'SUBSCRIBER' else 'FREE' end)::public.creator_ai_access;
    if v_title = '' then
      select title into v_title from public.creator_courses where id = p_source_id;
    end if;
    v_body := null;
  end if;

  if char_length(v_title) > 120 then
    v_title := left(v_title, 120);
  end if;

  v_id := 'cak_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20));
  insert into public.creator_ai_knowledge (id, creator_id, kind, title, body, source_id, access)
  values (v_id, v_creator, p_kind, v_title, v_body, p_source_id, v_access);

  return v_id;
end;
$$;

revoke execute on function public.add_creator_ai_knowledge(public.creator_ai_knowledge_kind, text, text, text, public.creator_ai_access) from public, anon;
grant execute on function public.add_creator_ai_knowledge(public.creator_ai_knowledge_kind, text, text, text, public.creator_ai_access) to authenticated;

create or replace function public.remove_creator_ai_knowledge(p_knowledge_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
begin
  if v_creator is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  delete from public.creator_ai_knowledge
   where id = p_knowledge_id and creator_id = v_creator;
  return found;
end;
$$;

revoke execute on function public.remove_creator_ai_knowledge(text) from public, anon;
grant execute on function public.remove_creator_ai_knowledge(text) to authenticated;


-- ── 4. Knowledge visibility (creator approval AND viewer entitlement) ──────
-- Retrieval calls this for every candidate entry. Two independent gates:
--   1. the source must still be live and still belong to the creator;
--   2. member-only material additionally needs a live entitlement.
create or replace function public.creator_ai_knowledge_visible(
  p_knowledge public.creator_ai_knowledge,
  p_viewer    text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_viewer is null then
    return false;
  end if;

  if p_knowledge.kind = 'VAULT_DROP' then
    if not exists (
      select 1 from public.vault_drops d
       where d.id = p_knowledge.source_id
         and d.creator_id = p_knowledge.creator_id
         and d.status = 'published'
         and d.deleted_at is null
    ) then
      return false;
    end if;
  elsif p_knowledge.kind = 'COLLECTION' then
    if not exists (
      select 1 from public.vault_collections c
       where c.id = p_knowledge.source_id and c.creator_id = p_knowledge.creator_id
    ) then
      return false;
    end if;
  elsif p_knowledge.kind = 'COURSE' then
    if not exists (
      select 1 from public.creator_courses c
       where c.id = p_knowledge.source_id
         and c.creator_id = p_knowledge.creator_id
         and c.access_type in ('free', 'subscriber')
    ) then
      return false;
    end if;
  end if;

  if p_knowledge.access = 'FREE' then
    return true;
  end if;

  return exists (
    select 1
      from public.creator_vaults cv
      join public.vault_subscriptions s on s.vault_id = cv.id
     where cv.creator_id = p_knowledge.creator_id
       and cv.status = 'active'
       and s.subscriber_id = p_viewer
       and s.status in ('active', 'trial')
       and s.current_period_end > now()
  );
end;
$$;

revoke execute on function public.creator_ai_knowledge_visible(public.creator_ai_knowledge, text) from public, anon, authenticated;

-- ── 5. Conversations ───────────────────────────────────────────────────────
create or replace function public.start_creator_ai_conversation(p_creator_id text)
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
    raise exception 'sign in to talk' using errcode = '42501';
  end if;
  if v_user = p_creator_id then
    raise exception 'use your Studio preview instead' using errcode = 'P0001';
  end if;
  if not public.creator_ai_viewer_can_access(p_creator_id, v_user) then
    raise exception 'this AI is not available' using errcode = 'P0001';
  end if;

  select id into v_id from public.creator_ai_conversations
   where creator_id = p_creator_id and profile_id = v_user;
  if v_id is null then
    insert into public.creator_ai_conversations (id, creator_id, profile_id)
    values ('cac_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)), p_creator_id, v_user)
    on conflict (creator_id, profile_id) do nothing;
    select id into v_id from public.creator_ai_conversations
     where creator_id = p_creator_id and profile_id = v_user;
  end if;

  return jsonb_build_object(
    'conversationId', v_id,
    'profile', public.creator_ai_profile_card(p_creator_id, v_user)
  );
end;
$$;

revoke execute on function public.start_creator_ai_conversation(text) from public, anon;
grant execute on function public.start_creator_ai_conversation(text) to authenticated;


-- ── 6. One turn: the caller's side ─────────────────────────────────────────
-- Called by the Edge Function *as the caller*, so entitlement, blocks and rate
-- limits are decided here rather than trusted from the function. Returns the
-- bounded prompt material (creator instructions + authorized knowledge +
-- recent history) and records the viewer's message.
create or replace function public.creator_ai_begin_turn(
  p_conversation_id text,
  p_body            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    text := public.my_profile_id();
  v_conv    public.creator_ai_conversations%rowtype;
  v_profile public.creator_ai_profiles%rowtype;
  v_body    text := trim(coalesce(p_body, ''));
  v_msg_id  text;
  v_history jsonb;
  v_knowledge jsonb;
begin
  if v_user is null then
    raise exception 'sign in to talk' using errcode = '42501';
  end if;
  -- Provider calls cost money: two windows, both bounded.
  perform public.assert_rate_limit(v_user, 'creator_ai_turn', 20, interval '1 hour');
  perform public.assert_rate_limit(v_user, 'creator_ai_turn_day', 60, interval '1 day');

  select * into v_conv from public.creator_ai_conversations where id = p_conversation_id;
  if not found or v_conv.profile_id <> v_user then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  select * into v_profile from public.creator_ai_profiles where creator_id = v_conv.creator_id;
  if not found or not v_profile.enabled then
    raise exception 'this AI is switched off' using errcode = 'P0004';
  end if;
  if not public.creator_ai_viewer_can_access(v_conv.creator_id, v_user) then
    raise exception 'not permitted' using errcode = 'P0001';
  end if;
  if v_body = '' or char_length(v_body) > 1000 then
    raise exception 'a message must be 1-1000 characters' using errcode = 'P0003';
  end if;

  insert into public.creator_ai_messages (id, conversation_id, role, body)
  values ('cam_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
          v_conv.id, 'user', v_body)
  returning id into v_msg_id;

  update public.creator_ai_conversations
     set last_message_at = now()
   where id = v_conv.id;

  -- Bounded context: the last 12 exchanges, clipped, oldest first.
  select coalesce(jsonb_agg(jsonb_build_object('role', h.role, 'body', h.body) order by h.created_at asc), '[]'::jsonb)
    into v_history
    from (
      select m.role, left(m.body, 1000) as body, m.created_at
        from public.creator_ai_messages m
       where m.conversation_id = v_conv.id
         and m.id <> v_msg_id
       order by m.created_at desc
       limit 12
    ) h;

  -- Only creator-approved material the viewer is entitled to, clipped and
  -- capped. Creator notes come first so authored intent leads the prompt.
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', k.kind, 'title', k.title, 'body', left(coalesce(k.body, k.title), 1200)
         )), '[]'::jsonb)
    into v_knowledge
    from (
      select k.*
        from public.creator_ai_knowledge k
       where k.creator_id = v_conv.creator_id
         and public.creator_ai_knowledge_visible(k, v_user)
       order by (case k.kind when 'NOTE' then 0 else 1 end), k.created_at desc
       limit 6
    ) k;

  return jsonb_build_object(
    'conversationId', v_conv.id,
    'creatorId', v_conv.creator_id,
    'displayName', v_profile.display_name,
    'description', v_profile.description,
    'welcomeMessage', v_profile.welcome_message,
    -- Server-side only: the Edge Function uses these to shape the AI's voice and
    -- never returns them to a client.
    'instructions', v_profile.instructions,
    'knowledge', v_knowledge,
    'history', v_history,
    'userMessageId', v_msg_id
  );
end;
$$;

revoke execute on function public.creator_ai_begin_turn(text, text) from public, anon;
grant execute on function public.creator_ai_begin_turn(text, text) to authenticated;


-- ── 7. One turn: the server's side ─────────────────────────────────────────
-- SERVICE ROLE ONLY. This is the only writer of assistant messages, and no
-- client role may execute it — which is what makes a fabricated AI reply
-- impossible from the app.
create or replace function public.creator_ai_finish_turn(
  p_conversation_id text,
  p_body            text,
  p_provider        text default null,
  p_model           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.creator_ai_conversations%rowtype;
  v_body text := trim(coalesce(p_body, ''));
  v_row  public.creator_ai_messages%rowtype;
begin
  select * into v_conv from public.creator_ai_conversations where id = p_conversation_id;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.creator_ai_profiles
     where creator_id = v_conv.creator_id and enabled
  ) then
    raise exception 'this AI is switched off' using errcode = 'P0004';
  end if;
  if v_body = '' or char_length(v_body) > 4000 then
    raise exception 'a reply must be 1-4000 characters' using errcode = 'P0003';
  end if;

  insert into public.creator_ai_messages (id, conversation_id, role, body, provider, model)
  values ('cam_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
          v_conv.id, 'assistant', v_body,
          nullif(left(coalesce(p_provider, ''), 40), ''),
          nullif(left(coalesce(p_model, ''), 60), ''))
  returning * into v_row;

  update public.creator_ai_conversations set last_message_at = now() where id = v_conv.id;

  return jsonb_build_object(
    'id', v_row.id,
    'role', v_row.role,
    'body', v_row.body,
    'provider', v_row.provider,
    'model', v_row.model,
    'createdAt', v_row.created_at
  );
end;
$$;

-- Deliberately unreachable for clients: only the service role may record what
-- the model said.
revoke execute on function public.creator_ai_finish_turn(text, text, text, text) from public, anon, authenticated;
grant execute on function public.creator_ai_finish_turn(text, text, text, text) to service_role;

-- ── 8. History, own conversation only ──────────────────────────────────────
create or replace function public.list_creator_ai_messages(
  p_conversation_id text,
  p_before          timestamptz default null,
  p_limit           integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user  text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 40));
  v_conv  public.creator_ai_conversations%rowtype;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;
  select * into v_conv from public.creator_ai_conversations where id = p_conversation_id;
  -- Someone else's conversation is indistinguishable from one that does not
  -- exist: no ownership oracle.
  if not found or v_conv.profile_id <> v_user then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id,
             'role', m.role,
             'body', m.body,
             'provider', m.provider,
             'model', m.model,
             'createdAt', m.created_at
           ) order by m.created_at desc)
      from (
        select * from public.creator_ai_messages x
         where x.conversation_id = p_conversation_id
           and (p_before is null or x.created_at < p_before)
         order by x.created_at desc
         limit v_limit
      ) m
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_creator_ai_messages(text, timestamptz, integer) from public, anon;
grant execute on function public.list_creator_ai_messages(text, timestamptz, integer) to authenticated;

-- ── 9. Moderation ──────────────────────────────────────────────────────────
-- A report reuses the shared pipeline with a dedicated target kind.
create or replace function public.report_creator_ai_message(
  p_message_id text,
  p_reason     public.report_reason,
  p_detail     text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter text := public.my_profile_id();
  v_conv     text;
begin
  if v_reporter is null then
    raise exception 'sign in to report' using errcode = '42501';
  end if;
  select c.id into v_conv
    from public.creator_ai_messages m
    join public.creator_ai_conversations c on c.id = m.conversation_id
   where m.id = p_message_id and c.profile_id = v_reporter;
  if v_conv is null then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  return public.submit_report('creator_ai_message'::public.report_target, p_message_id, p_reason, p_detail);
end;
$$;

revoke execute on function public.report_creator_ai_message(text, public.report_reason, text) from public, anon;
grant execute on function public.report_creator_ai_message(text, public.report_reason, text) to authenticated;

