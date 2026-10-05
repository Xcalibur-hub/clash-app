-- ============================================================================
-- CLASH 2.0 · Phase 15.5B — Digital Creator (RPC surface)
-- ----------------------------------------------------------------------------
-- Extends the Phase 15.5 card and configuration; adds the session handle.
-- A viewer-safe card NEVER carries a provider slug reference or an external
-- model/voice id — those stay server-side.
-- ============================================================================

-- ── 1. Viewer-safe card, now with the digital block ────────────────────────
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
  v_avatar public.media_objects%rowtype;
  v_access boolean;
  v_owner boolean := p_viewer is not null and p_viewer = p_creator_id;
  v_starters jsonb := '[]'::jsonb;
  v_consented boolean;
  v_available boolean;
  v_digital jsonb;
begin
  select * into v from public.creator_ai_profiles where creator_id = p_creator_id;
  if not found then
    return null;
  end if;
  select * into v_creator from public.profiles where id = p_creator_id;
  if v.artwork_media_object_id is not null then
    select * into v_media from public.media_objects where id = v.artwork_media_object_id;
  end if;
  if v.avatar_media_object_id is not null then
    select * into v_avatar from public.media_objects where id = v.avatar_media_object_id;
  end if;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into v_starters
    from (
      select e as entry
        from jsonb_array_elements(v.starters) e
       where jsonb_typeof(e) = 'string' and char_length(e #>> '{}') between 1 and 120
       limit 6
    ) t;

  v_access := public.creator_ai_viewer_can_access(p_creator_id, p_viewer);

  -- The digital version exists as a concept only once the creator expresses it
  -- (a display name or a connected provider) and can only be used when the AI
  -- is on, a flag is enabled and consent was recorded.
  v_consented := v.likeness_consent_at is not null;
  v_available := v.enabled
    and (v.avatar_enabled or v.voice_enabled)
    and v_consented
    and v.avatar_provider <> 'none';

  if v.enabled and (v.avatar_display_name is not null or v.avatar_provider <> 'none') then
    v_digital := jsonb_build_object(
      'configured', true,
      'available', v_available,
      'displayName', coalesce(v.avatar_display_name, v.display_name),
      'avatarEnabled', v.avatar_enabled and v_consented,
      'voiceEnabled', v.voice_enabled and v_consented,
      'textFallback', v.text_fallback_enabled,
      'preferredMode', case
        when v_available and v.avatar_enabled then 'AVATAR'
        when v_available and v.voice_enabled then 'VOICE'
        else 'TEXT'
      end,
      'artwork', case
        when v_avatar.id is null or v_avatar.status <> 'ready' or v_avatar.deleted_at is not null then null
        else jsonb_build_object('bucket', v_avatar.bucket, 'path', v_avatar.storage_path, 'kind', v_avatar.media_kind)
      end
    );
  else
    v_digital := null;
  end if;

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
    'digital', v_digital,
    'viewerAccess', v_access,
    'canChat', v_access and not v_owner and p_viewer is not null,
    'isOwner', v_owner
  );
end;
$$;

revoke execute on function public.creator_ai_profile_card(text, text) from public, anon, authenticated;

-- ── 2. Creator's own view, now including the digital configuration ─────────
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
  v_avatar public.media_objects%rowtype;
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
  if v.avatar_media_object_id is not null then
    select * into v_avatar from public.media_objects where id = v.avatar_media_object_id;
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
    'artwork', case
      when v_media.id is null or v_media.status <> 'ready' or v_media.deleted_at is not null then null
      else jsonb_build_object('bucket', v_media.bucket, 'path', v_media.storage_path, 'kind', v_media.media_kind)
    end,
    -- The creator's own provider reference. Never returned by a viewer card.
    'digital', jsonb_build_object(
      'provider', v.avatar_provider,
      'avatarExternalId', v.avatar_external_id,
      'voiceExternalId', v.voice_external_id,
      'displayName', v.avatar_display_name,
      'avatarEnabled', v.avatar_enabled,
      'voiceEnabled', v.voice_enabled,
      'textFallbackEnabled', v.text_fallback_enabled,
      'consentAt', v.likeness_consent_at,
      'consentVersion', v.likeness_consent_version,
      'artworkMediaObjectId', v.avatar_media_object_id,
      'connected', v.avatar_provider <> 'none' and v.avatar_external_id is not null,
      'artwork', case
        when v_avatar.id is null or v_avatar.status <> 'ready' or v_avatar.deleted_at is not null then null
        else jsonb_build_object('bucket', v_avatar.bucket, 'path', v_avatar.storage_path, 'kind', v_avatar.media_kind)
      end
    ),
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



-- ── 3. Connect / configure the digital version ─────────────────────────────
-- Only the authenticated creator managing their own world may connect a model,
-- and enabling anything requires an explicit rights confirmation.
create or replace function public.set_creator_digital_version(
  p_provider                 text,
  p_avatar_external_id       text default null,
  p_voice_external_id        text default null,
  p_display_name             text default null,
  p_avatar_media_object_id   text default null,
  p_avatar_enabled           boolean default false,
  p_voice_enabled            boolean default false,
  p_text_fallback_enabled    boolean default true,
  p_confirm_likeness_consent boolean default false,
  p_consent_version          text default 'v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v public.creator_ai_profiles%rowtype;
  v_provider text := lower(trim(coalesce(p_provider, 'none')));
  v_avatar_ref text := nullif(trim(coalesce(p_avatar_external_id, '')), '');
  v_voice_ref text := nullif(trim(coalesce(p_voice_external_id, '')), '');
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_media public.media_objects%rowtype;
  v_reference_changed boolean;
begin
  if v_creator is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_creator, 'digital_creator_config', 30, interval '1 hour');

  if not exists (select 1 from public.creator_vaults where creator_id = v_creator and status = 'active') then
    raise exception 'open your vault first' using errcode = 'P0006';
  end if;

  select * into v from public.creator_ai_profiles where creator_id = v_creator;
  if not found then
    raise exception 'create your AI first' using errcode = 'P0004';
  end if;

  if v_provider !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'unknown provider slug' using errcode = 'P0003';
  end if;
  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'a digital display name must be 40 characters or fewer' using errcode = 'P0003';
  end if;

  if v_provider = 'none' then
    if p_avatar_enabled or p_voice_enabled then
      raise exception 'connect a provider before enabling your digital version' using errcode = 'P0003';
    end if;
    v_avatar_ref := null;
    v_voice_ref := null;
  elsif v_avatar_ref is null then
    raise exception 'a provider connection needs a model reference' using errcode = 'P0003';
  end if;

  -- Consent is tied to the reference it was given for: pointing at a different
  -- model or voice means a fresh confirmation.
  v_reference_changed := (v.avatar_external_id is distinct from v_avatar_ref)
    or (v.voice_external_id is distinct from v_voice_ref)
    or (v.avatar_provider is distinct from v_provider);
  if (p_avatar_enabled or p_voice_enabled)
     and not p_confirm_likeness_consent
     and (v.likeness_consent_at is null or v_reference_changed) then
    raise exception 'confirm you own or may use this likeness and voice' using errcode = 'P0003';
  end if;

  if p_avatar_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_avatar_media_object_id;
    if v_media.id is null or v_media.owner_id is distinct from v_creator
       or v_media.status is distinct from 'ready' or v_media.deleted_at is not null
       or v_media.visibility is distinct from 'public' or v_media.bucket is distinct from 'public-media' then
      raise exception 'attach a finished public upload you own' using errcode = 'P0004';
    end if;
  end if;

  update public.creator_ai_profiles
     set avatar_provider = v_provider,
         avatar_external_id = v_avatar_ref,
         voice_external_id = v_voice_ref,
         avatar_display_name = v_name,
         avatar_media_object_id = coalesce(p_avatar_media_object_id, avatar_media_object_id),
         avatar_enabled = p_avatar_enabled,
         voice_enabled = p_voice_enabled,
         text_fallback_enabled = p_text_fallback_enabled,
         likeness_consent_at = case when p_confirm_likeness_consent then now() else likeness_consent_at end,
         likeness_consent_version = case
           when p_confirm_likeness_consent then left(coalesce(p_consent_version, 'v1'), 20)
           else likeness_consent_version
         end,
         updated_at = now()
   where creator_id = v_creator;

  return public.get_my_creator_ai();
end;
$$;

revoke execute on function public.set_creator_digital_version(text, text, text, text, text, boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.set_creator_digital_version(text, text, text, text, text, boolean, boolean, boolean, boolean, text) to authenticated;

-- ── 4. Disconnect: text AI survives, avatar access stops immediately ───────
create or replace function public.disconnect_creator_digital_version()
returns jsonb
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

  -- Live rendering sessions die with the connection.
  update public.digital_creator_sessions
     set status = 'ENDED', ended_at = now()
   where creator_id = v_creator and status = 'ACTIVE';

  update public.creator_ai_profiles
     set avatar_provider = 'none',
         avatar_external_id = null,
         voice_external_id = null,
         avatar_enabled = false,
         voice_enabled = false,
         likeness_consent_at = null,
         likeness_consent_version = null,
         updated_at = now()
   where creator_id = v_creator;

  return public.get_my_creator_ai();
end;
$$;

revoke execute on function public.disconnect_creator_digital_version() from public, anon;
grant execute on function public.disconnect_creator_digital_version() to authenticated;

-- ── 5. Sessions: rendering handles, never credentials ──────────────────────
create or replace function public.digital_creator_session_card(p_session_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v public.digital_creator_sessions%rowtype;
begin
  if v_user is null then
    return null;
  end if;
  select * into v from public.digital_creator_sessions where id = p_session_id;
  -- Someone else's session is indistinguishable from one that does not exist.
  if not found or v.profile_id <> v_user then
    return null;
  end if;
  return jsonb_build_object(
    'id', v.id,
    'creatorId', v.creator_id,
    'mode', v.mode,
    -- No provider slug and no external reference: the client asks our own
    -- render endpoint, which resolves the adapter server-side.
    'status', case when v.status = 'ACTIVE' and v.expires_at <= now() then 'EXPIRED' else v.status end,
    'startedAt', v.started_at,
    'endedAt', v.ended_at,
    'expiresAt', v.expires_at,
    'active', v.status = 'ACTIVE' and v.expires_at > now()
  );
end;
$$;

revoke execute on function public.digital_creator_session_card(text) from public, anon;
grant execute on function public.digital_creator_session_card(text) to authenticated;


/**
 * Open a rendering session for an explicit TALK entry.
 *
 * This does not generate anything and does not carry knowledge: the reply still
 * comes from `creator_ai_begin_turn`, so an avatar can never widen what the AI
 * is allowed to say or who is allowed to hear it.
 */
create or replace function public.start_digital_creator_session(
  p_creator_id text,
  p_mode       text default 'TEXT'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v public.creator_ai_profiles%rowtype;
  v_mode text := upper(trim(coalesce(p_mode, 'TEXT')));
  v_consented boolean;
  v_session_id text;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'sign in to talk' using errcode = '42501';
  end if;
  if v_user = p_creator_id then
    raise exception 'use your Studio preview instead' using errcode = 'P0001';
  end if;
  perform public.assert_rate_limit(v_user, 'digital_creator_session', 30, interval '1 hour');

  if v_mode not in ('TEXT', 'VOICE', 'AVATAR') then
    raise exception 'unknown mode' using errcode = 'P0003';
  end if;

  select * into v from public.creator_ai_profiles where creator_id = p_creator_id;
  if not found or not v.enabled then
    raise exception 'this AI is not available' using errcode = 'P0004';
  end if;
  if not public.creator_ai_viewer_can_access(p_creator_id, v_user) then
    raise exception 'not permitted' using errcode = 'P0001';
  end if;

  v_consented := v.likeness_consent_at is not null;

  if v_mode = 'AVATAR' then
    if not v.avatar_enabled or not v_consented
       or v.avatar_provider = 'none' or v.avatar_external_id is null then
      raise exception 'the digital version is not connected' using errcode = 'P0004';
    end if;
  elsif v_mode = 'VOICE' then
    if not v.voice_enabled or not v_consented
       or v.avatar_provider = 'none' or v.avatar_external_id is null then
      raise exception 'the digital voice is not connected' using errcode = 'P0004';
    end if;
  end if;

  -- Text always works: it is the existing Creator AI with no rendering at all.
  if v_mode = 'TEXT' then
    return jsonb_build_object(
      'sessionId', null,
      'creatorId', p_creator_id,
      'mode', 'TEXT',
      'active', true,
      'expiresAt', null,
      'textFallback', v.text_fallback_enabled
    );
  end if;

  -- One live handle per viewer per creator: opening another replaces the last,
  -- which keeps rows bounded and makes "terminate when leaving" reliable.
  update public.digital_creator_sessions
     set status = 'ENDED', ended_at = now()
   where creator_id = p_creator_id and profile_id = v_user and status = 'ACTIVE';

  v_expires := now() + interval '20 minutes';
  insert into public.digital_creator_sessions
    (id, creator_id, profile_id, provider, mode, status, expires_at)
  values
    ('dcs_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
     p_creator_id, v_user, v.avatar_provider, v_mode, 'ACTIVE', v_expires)
  returning id into v_session_id;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'creatorId', p_creator_id,
    'mode', v_mode,
    'active', true,
    'expiresAt', v_expires,
    'textFallback', v.text_fallback_enabled
  );
end;
$$;

revoke execute on function public.start_digital_creator_session(text, text) from public, anon;
grant execute on function public.start_digital_creator_session(text, text) to authenticated;

create or replace function public.end_digital_creator_session(p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
begin
  if v_user is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  update public.digital_creator_sessions
     set status = 'ENDED', ended_at = now()
   where id = p_session_id and profile_id = v_user and status = 'ACTIVE';
  return found;
end;
$$;

revoke execute on function public.end_digital_creator_session(text) from public, anon;
grant execute on function public.end_digital_creator_session(text) to authenticated;

