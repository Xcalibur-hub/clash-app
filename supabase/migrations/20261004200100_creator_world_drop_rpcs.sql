-- ============================================================================
-- CLASH 2.0 · Phase 15.3 — Creator World Drops write + read surface (RPCs)
-- ----------------------------------------------------------------------------
-- Every mutation resolves the caller from auth.uid(). Claims are idempotent and
-- server-authoritative: a client can never set claimed/completed/reward on its
-- own. Rewards that unlock Vault content are represented by a claim row that the
-- EXISTING `can_access_vault_drop` predicate recognizes — signed media keeps
-- flowing through the existing edge function.
-- ============================================================================

-- ── 1. Vault access now recognizes a claimed World Drop entitlement ──────────
create or replace function public.can_access_vault_drop(
  p_viewer_profile_id text,
  p_drop_id           text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when d.creator_id = p_viewer_profile_id then d.deleted_at is null
        when d.deleted_at is not null or d.status = 'removed' then false
        when not (
          (d.status = 'published' and d.expires_at > now())
          or (
            d.status in ('published', 'expired')
            and exists (select 1 from public.vault_collection_items i where i.drop_id = d.id)
          )
        ) then false
        when p_viewer_profile_id is null then d.access_level = 'free'
        when exists (
          select 1 from public.blocks b
           where (b.blocker_id = d.creator_id and b.blocked_id = p_viewer_profile_id)
              or (b.blocker_id = p_viewer_profile_id and b.blocked_id = d.creator_id)
        ) then false
        -- A World Drop reward this viewer claimed is a real, server-side entitlement.
        when exists (
          select 1 from public.world_drop_claims c
           where c.profile_id = p_viewer_profile_id
             and c.reward_type = 'CONTENT_UNLOCK'
             and c.reward_ref = d.id
        ) then true
        when d.access_level = 'free' then true
        else exists (
          select 1 from public.vault_subscriptions s
           where s.vault_id = d.vault_id
             and s.subscriber_id = p_viewer_profile_id
             and s.status in ('active', 'trial')
             and s.current_period_end > now()
        )
      end
      from public.vault_drops d
      where d.id = p_drop_id
    ),
    false
  );
$$;
-- ── 2. Drop card (adds type, clue, reward type + the viewer's claim state) ──
create or replace function public.world_drop_card(
  p_drop public.world_drops,
  p_meters double precision default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_media public.media_objects%rowtype;
  v_author public.profiles%rowtype;
  v_creator public.profiles%rowtype;
  v_mission public.world_missions%rowtype;
  v_viewer text := public.my_profile_id();
  v_lat double precision;
  v_lng double precision;
begin
  if p_drop.media_object_id is not null then
    select * into v_media from public.media_objects where id = p_drop.media_object_id;
  end if;
  select * into v_author from public.profiles where id = p_drop.author_id;
  if p_drop.creator_id is not null then
    select * into v_creator from public.profiles where id = p_drop.creator_id;
  end if;
  if p_drop.mission_id is not null then
    select * into v_mission from public.world_missions where id = p_drop.mission_id;
  end if;

  v_lng := extensions.ST_X(p_drop.approx_location::extensions.geometry);
  v_lat := extensions.ST_Y(p_drop.approx_location::extensions.geometry);

  return jsonb_build_object(
    'id', p_drop.id,
    'missionId', p_drop.mission_id,
    'caption', p_drop.caption,
    'status', p_drop.status,
    'publishedAt', p_drop.published_at,
    'expiresAt', p_drop.expires_at,
    'locationLabel', p_drop.location_label,
    'approxLat', round(v_lat::numeric, 4),
    'approxLng', round(v_lng::numeric, 4),
    'distanceBand', public.world_distance_band(p_meters),
    'dropType', p_drop.drop_type,
    'clue', p_drop.clue,
    'rewardType', p_drop.reward_type,
    'creatorId', p_drop.creator_id,
    'creatorName', v_creator.name,
    'creatorHandle', v_creator.handle,
    'creatorTint', v_creator.avatar_tint,
    'claimed', (v_viewer is not null and exists (
      select 1 from public.world_drop_claims c
       where c.drop_id = p_drop.id and c.profile_id = v_viewer
    )),
    'claimable', (
      p_drop.creator_id is not null
      and v_viewer is not null
      and v_viewer <> p_drop.author_id
      and not public.world_author_hidden(v_viewer, p_drop.author_id)
    ),
    'author', case when v_author.id is null then null else jsonb_build_object(
      'id', v_author.id,
      'handle', v_author.handle,
      'name', v_author.name,
      'avatarTint', v_author.avatar_tint
    ) end,
    'media', case
      when v_media.id is null or v_media.status <> 'ready' or v_media.deleted_at is not null then null
      else jsonb_build_object(
        'id', v_media.id,
        'bucket', v_media.bucket,
        'path', v_media.storage_path,
        'kind', v_media.media_kind
      )
    end,
    'mission', case when v_mission.id is null then null else jsonb_build_object(
      'id', v_mission.id,
      'title', v_mission.title,
      'prompt', v_mission.prompt
    ) end
  );
end;
$$;
-- ── 3. Creator creates a World Drop ─────────────────────────────────────────
create or replace function public.create_creator_world_drop(
  p_caption         text,
  p_clue            text,
  p_drop_type       public.world_drop_type,
  p_reward_type     public.world_drop_reward,
  p_reward_ref      text default null,
  p_media_object_id text default null,
  p_latitude        double precision default null,
  p_longitude       double precision default null,
  p_location_label  text default null,
  p_expires_at      timestamptz default null
)
returns public.world_drops
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_caption text := coalesce(trim(p_caption), '');
  v_clue    text := nullif(trim(coalesce(p_clue, '')), '');
  v_label   text := nullif(trim(coalesce(p_location_label, '')), '');
  v_ref     text := nullif(trim(coalesce(p_reward_ref, '')), '');
  v_media   public.media_objects%rowtype;
  v_target  public.vault_drops%rowtype;
  v_approx  extensions.geography;
  v_cell    text;
  v_row     public.world_drops%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to place a World Drop' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_creator, 'world_drop_create', 20, interval '1 hour');

  if not exists (select 1 from public.creator_vaults where creator_id = v_creator and status = 'active') then
    raise exception 'open your vault first' using errcode = 'P0006';
  end if;
  if v_caption = '' or char_length(v_caption) > 180 then
    raise exception 'a title must be 1-180 characters' using errcode = 'P0003';
  end if;
  if v_clue is not null and char_length(v_clue) > 280 then
    raise exception 'a clue must be 280 characters or fewer' using errcode = 'P0003';
  end if;
  if v_label is not null and char_length(v_label) > 60 then
    raise exception 'a place label must be 60 characters or fewer' using errcode = 'P0003';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'choose a destination' using errcode = 'P0003';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expiry must be in the future' using errcode = 'P0003';
  end if;

  if p_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_media_object_id;
    if v_media.id is null or v_media.owner_id is distinct from v_creator
       or v_media.status is distinct from 'ready' or v_media.deleted_at is not null
       or v_media.visibility is distinct from 'public' or v_media.bucket is distinct from 'public-media' then
      raise exception 'attach a finished public upload you own' using errcode = 'P0004';
    end if;
  end if;

  if p_reward_type = 'CONTENT_UNLOCK' then
    if v_ref is null then
      raise exception 'a content unlock needs a target Drop' using errcode = 'P0003';
    end if;
    select * into v_target from public.vault_drops where id = v_ref;
    if v_target.id is null or v_target.creator_id <> v_creator then
      raise exception 'that Drop is not yours' using errcode = 'P0001';
    end if;
    if v_target.status <> 'published' or v_target.deleted_at is not null then
      raise exception 'publish that Drop first' using errcode = 'P0003';
    end if;
  elsif v_ref is not null and char_length(v_ref) > 60 then
    raise exception 'reward reference must be 60 characters or fewer' using errcode = 'P0003';
  end if;

  if p_drop_type = 'CREATOR_UNLOCK' and v_ref is null then
    raise exception 'a creator unlock needs a target' using errcode = 'P0003';
  end if;

  -- Fuzz immediately; raw coordinates are local variables only.
  v_approx := public.world_fuzz_location(p_latitude, p_longitude);
  v_cell := extensions.ST_GeoHash(v_approx::extensions.geometry, 6);

  insert into public.world_drops (
    id, mission_id, author_id, creator_id, media_object_id, caption, clue,
    drop_type, reward_type, reward_ref, reward_payload,
    approx_location, location_cell, location_label,
    status, published_at, expires_at
  ) values (
    'wd_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
    null, v_creator, v_creator, p_media_object_id, v_caption, v_clue,
    p_drop_type, p_reward_type, v_ref, null,
    v_approx, v_cell, v_label,
    'PUBLISHED', now(), p_expires_at
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 4. Publish / unpublish / remove ─────────────────────────────────────────
create or replace function public.set_creator_world_drop_status(
  p_drop_id text,
  p_status  public.world_drop_status
)
returns public.world_drops
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row public.world_drops%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_status not in ('DRAFT', 'PUBLISHED', 'REMOVED') then
    raise exception 'unsupported status' using errcode = 'P0003';
  end if;

  update public.world_drops
     set status = p_status,
         published_at = case when p_status = 'PUBLISHED' then coalesce(published_at, now()) else published_at end
   where id = p_drop_id and creator_id = v_creator
  returning * into v_row;
  if not found then
    raise exception 'drop not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;
-- ── 5. Claim (idempotent, server-authoritative) ─────────────────────────────
create or replace function public.claim_world_drop(p_drop_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  text := public.my_profile_id();
  v_drop  public.world_drops%rowtype;
  v_claim public.world_drop_claims%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to claim' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'world_drop_claim', 30, interval '1 hour');

  select * into v_drop from public.world_drops where id = p_drop_id for update;
  if v_drop.id is null or v_drop.deleted_at is not null then
    raise exception 'drop not found' using errcode = 'P0002';
  end if;
  if v_drop.status <> 'PUBLISHED' then
    raise exception 'drop is not available' using errcode = 'P0004';
  end if;
  if v_drop.expires_at is not null and v_drop.expires_at <= now() then
    raise exception 'drop has expired' using errcode = 'P0004';
  end if;
  if v_drop.creator_id is null then
    raise exception 'not a creator drop' using errcode = 'P0004';
  end if;
  if v_drop.author_id = v_user then
    raise exception 'you cannot claim your own drop' using errcode = 'P0001';
  end if;
  if public.world_author_hidden(v_user, v_drop.author_id) then
    raise exception 'unavailable' using errcode = 'P0001';
  end if;

  select * into v_claim from public.world_drop_claims
   where drop_id = p_drop_id and profile_id = v_user;
  if v_claim.drop_id is not null then
    return jsonb_build_object(
      'claimed', true, 'alreadyClaimed', true, 'dropId', v_drop.id,
      'rewardType', v_claim.reward_type, 'rewardRef', v_claim.reward_ref,
      'rewardPayload', v_claim.reward_payload, 'claimedAt', v_claim.claimed_at
    );
  end if;

  insert into public.world_drop_claims (drop_id, profile_id, reward_type, reward_ref, reward_payload)
  values (p_drop_id, v_user, v_drop.reward_type, v_drop.reward_ref, v_drop.reward_payload)
  on conflict (drop_id, profile_id) do nothing
  returning * into v_claim;

  if v_claim.drop_id is null then
    select * into v_claim from public.world_drop_claims
     where drop_id = p_drop_id and profile_id = v_user;
  end if;

  return jsonb_build_object(
    'claimed', true, 'alreadyClaimed', false, 'dropId', v_drop.id,
    'rewardType', v_claim.reward_type, 'rewardRef', v_claim.reward_ref,
    'rewardPayload', v_claim.reward_payload, 'claimedAt', v_claim.claimed_at
  );
end;
$$;

-- ── 6. Reads ────────────────────────────────────────────────────────────────
create or replace function public.list_creator_world_drops(p_creator_id text, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 40));
begin
  if p_creator_id is null or public.world_author_hidden(v_viewer, p_creator_id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.world_drop_card(q, null) order by q.published_at desc)
      from (
        select * from public.world_drops d
         where d.creator_id = p_creator_id
           and d.status = 'PUBLISHED'
           and d.deleted_at is null
           and (d.expires_at is null or d.expires_at > now())
         order by d.published_at desc
         limit v_limit
      ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.world_my_creator_drops(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 60));
begin
  if v_creator is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.world_drop_card(q, null) order by q.created_at desc)
      from (
        select * from public.world_drops d
         where d.creator_id = v_creator
           and d.deleted_at is null
         order by d.created_at desc
         limit v_limit
      ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_explore_world_drops(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 40));
begin
  return coalesce((
    select jsonb_agg(public.world_drop_card(q, null) order by q.published_at desc)
      from (
        select d.* from public.world_drops d
         where d.creator_id is not null
           and d.status = 'PUBLISHED'
           and d.deleted_at is null
           and (d.expires_at is null or d.expires_at > now())
           and not public.world_author_hidden(v_viewer, d.author_id)
         order by d.published_at desc
         limit v_limit
      ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_my_world_artifacts(p_limit integer default 40)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'dropId', c.drop_id,
             'rewardType', c.reward_type,
             'rewardRef', c.reward_ref,
             'rewardPayload', c.reward_payload,
             'claimedAt', c.claimed_at,
             'caption', d.caption,
             'dropType', d.drop_type,
             'creatorId', d.creator_id,
             'creatorName', p.name,
             'creatorHandle', p.handle,
             'creatorTint', p.avatar_tint,
             'media', case
               when m.id is null or m.status <> 'ready' or m.deleted_at is not null then null
               else jsonb_build_object('bucket', m.bucket, 'path', m.storage_path, 'kind', m.media_kind)
             end
           ) order by c.claimed_at desc)
      from (
        select * from public.world_drop_claims
         where profile_id = v_user
         order by claimed_at desc
         limit v_limit
      ) c
      join public.world_drops d on d.id = c.drop_id
      join public.profiles p on p.id = d.creator_id
      left join public.media_objects m on m.id = d.media_object_id
  ), '[]'::jsonb);
end;
$$;
-- ── 7. Privileges ───────────────────────────────────────────────────────────
grant execute on function public.create_creator_world_drop(text, text, public.world_drop_type, public.world_drop_reward, text, text, double precision, double precision, text, timestamptz) to authenticated;
revoke execute on function public.create_creator_world_drop(text, text, public.world_drop_type, public.world_drop_reward, text, text, double precision, double precision, text, timestamptz) from public, anon;

grant execute on function public.set_creator_world_drop_status(text, public.world_drop_status) to authenticated;
revoke execute on function public.set_creator_world_drop_status(text, public.world_drop_status) from public, anon;

grant execute on function public.claim_world_drop(text) to authenticated;
revoke execute on function public.claim_world_drop(text) from public, anon;

grant execute on function public.list_creator_world_drops(text, integer) to anon, authenticated;
revoke execute on function public.list_creator_world_drops(text, integer) from public;

grant execute on function public.list_explore_world_drops(integer) to anon, authenticated;
revoke execute on function public.list_explore_world_drops(integer) from public;

grant execute on function public.world_my_creator_drops(integer) to authenticated;
revoke execute on function public.world_my_creator_drops(integer) from public, anon;

grant execute on function public.get_my_world_artifacts(integer) to authenticated;
revoke execute on function public.get_my_world_artifacts(integer) from public, anon;