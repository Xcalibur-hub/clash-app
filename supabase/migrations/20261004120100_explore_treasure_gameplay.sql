-- ============================================================================
-- Phase 14.1b — Treasure gameplay + creator host foundations
-- ============================================================================

alter type public.report_target add value if not exists 'challenge_entry';

-- ── Creator host helpers ─────────────────────────────────────────────────────
create or replace function public.assert_play_host()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_role public.profile_role;
begin
  if v_user is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_user;
  if v_role is distinct from 'creator'
     and v_role is distinct from 'moderator'
     and v_role is distinct from 'admin'
     and not exists (
       select 1 from public.creator_vaults v
        where v.creator_id = v_user and v.status = 'active'
     ) then
    raise exception 'creator permission required' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

revoke execute on function public.assert_play_host() from public, anon, authenticated;

create or replace function public.host_explore_challenge(
  p_title text,
  p_description text,
  p_challenge_type public.explore_challenge_type,
  p_country_code text,
  p_cover_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reward_type public.explore_reward_type default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.assert_play_host();
  v_id text;
  v_country text := nullif(upper(btrim(coalesce(p_country_code, ''))), '');
begin
  perform public.assert_rate_limit(v_user, 'challenge_host', 10, interval '1 day');

  if p_challenge_type = 'COUNTRY' and (v_country is null or v_country !~ '^[A-Z]{2}$') then
    raise exception 'country required' using errcode = 'P0004';
  end if;
  if p_challenge_type <> 'COUNTRY' then
    v_country := null;
  end if;
  if p_ends_at <= coalesce(p_starts_at, now()) then
    raise exception 'invalid window' using errcode = 'P0004';
  end if;

  insert into public.explore_challenges (
    title, description, challenge_type, country_code, creator_id,
    starts_at, ends_at, status, cover_url, visibility, reward_type
  ) values (
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_challenge_type,
    v_country,
    v_user,
    coalesce(p_starts_at, now()),
    p_ends_at,
    'active',
    nullif(btrim(coalesce(p_cover_url, '')), ''),
    'public',
    p_reward_type
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'hosted', true);
end;
$$;

revoke execute on function public.host_explore_challenge(
  text, text, public.explore_challenge_type, text, text, timestamptz, timestamptz, public.explore_reward_type
) from public;
grant execute on function public.host_explore_challenge(
  text, text, public.explore_challenge_type, text, text, timestamptz, timestamptz, public.explore_reward_type
) to authenticated;

create or replace function public.host_explore_treasure(
  p_title text,
  p_description text,
  p_hunt_type public.explore_treasure_type,
  p_country_code text,
  p_cover_url text,
  p_teaser text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reward_type public.explore_reward_type,
  p_reward_metadata jsonb,
  p_gifts_remaining integer,
  p_clues jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.assert_play_host();
  v_id text;
  v_country text := nullif(upper(btrim(coalesce(p_country_code, ''))), '');
  v_clue jsonb;
  v_order integer := 0;
  v_clue_id text;
  v_type public.explore_clue_type;
  v_answer text;
begin
  perform public.assert_rate_limit(v_user, 'treasure_host', 10, interval '1 day');

  if p_hunt_type = 'COUNTRY' and (v_country is null or v_country !~ '^[A-Z]{2}$') then
    raise exception 'country required' using errcode = 'P0004';
  end if;
  if p_hunt_type <> 'COUNTRY' then
    v_country := null;
  end if;
  if jsonb_typeof(p_clues) <> 'array' or jsonb_array_length(p_clues) < 1 then
    raise exception 'clues required' using errcode = 'P0004';
  end if;
  if p_gifts_remaining is not null and p_gifts_remaining < 0 then
    raise exception 'invalid gifts' using errcode = 'P0004';
  end if;

  insert into public.explore_treasure_hunts (
    title, description, country_code, creator_id, starts_at, ends_at, status,
    clue, reward_type, reward_metadata, gifts_remaining, visibility,
    cover_url, hunt_type, clue_count
  ) values (
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_country,
    v_user,
    coalesce(p_starts_at, now()),
    p_ends_at,
    'active',
    btrim(p_teaser),
    coalesce(p_reward_type, 'badge'),
    coalesce(p_reward_metadata, '{}'::jsonb),
    p_gifts_remaining,
    'public',
    nullif(btrim(coalesce(p_cover_url, '')), ''),
    p_hunt_type,
    jsonb_array_length(p_clues)
  )
  returning id into v_id;

  for v_clue in select * from jsonb_array_elements(p_clues)
  loop
    v_order := v_order + 1;
    v_type := (v_clue ->> 'clueType')::public.explore_clue_type;
    v_clue_id := public.new_arena_id('tcl_');
    v_answer := nullif(btrim(coalesce(v_clue ->> 'answer', '')), '');

    if v_type in ('TEXT_ANSWER', 'MULTIPLE_CHOICE') and v_answer is null then
      raise exception 'answer required' using errcode = 'P0004';
    end if;

    insert into public.explore_treasure_clues (
      id, hunt_id, sort_order, clue_type, prompt, choices,
      answer_digest, content_target_kind, content_target_id
    ) values (
      v_clue_id,
      v_id,
      v_order,
      v_type,
      btrim(v_clue ->> 'prompt'),
      coalesce(v_clue -> 'choices', '[]'::jsonb),
      case
        when v_type in ('TEXT_ANSWER', 'MULTIPLE_CHOICE')
          then public.explore_answer_digest(v_clue_id, v_answer)
        else null
      end,
      case
        when v_type = 'CONTENT_FIND'
          then (v_clue ->> 'contentTargetKind')::public.explore_content_target
        else null
      end,
      case when v_type = 'CONTENT_FIND' then nullif(v_clue ->> 'contentTargetId', '') else null end
    );
  end loop;

  return jsonb_build_object('id', v_id, 'hosted', true, 'clueCount', v_order);
end;
$$;

revoke execute on function public.host_explore_treasure(
  text, text, public.explore_treasure_type, text, text, text, timestamptz, timestamptz,
  public.explore_reward_type, jsonb, integer, jsonb
) from public;
grant execute on function public.host_explore_treasure(
  text, text, public.explore_treasure_type, text, text, text, timestamptz, timestamptz,
  public.explore_reward_type, jsonb, integer, jsonb
) to authenticated;

-- ── Treasure RPCs ────────────────────────────────────────────────────────────
create or replace function public.join_treasure_hunt(p_hunt_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_hunt public.explore_treasure_hunts%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to join' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'treasure_join', 30, interval '1 hour');

  select * into v_hunt from public.explore_treasure_hunts where id = p_hunt_id;
  if v_hunt.id is null or v_hunt.visibility <> 'public' then
    raise exception 'hunt not found' using errcode = 'P0002';
  end if;
  if v_hunt.status <> 'active' or v_hunt.ends_at <= now() then
    raise exception 'hunt not open' using errcode = 'P0003';
  end if;

  insert into public.explore_treasure_progress (hunt_id, profile_id, progress)
  values (p_hunt_id, v_user, 0)
  on conflict (hunt_id, profile_id) do nothing;

  return jsonb_build_object('joined', true, 'huntId', p_hunt_id);
end;
$$;

revoke execute on function public.join_treasure_hunt(text) from public;
grant execute on function public.join_treasure_hunt(text) to authenticated;

create or replace function public.play_next_clue_payload(
  p_hunt_id text,
  p_progress integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', c.id,
           'sortOrder', c.sort_order,
           'clueType', c.clue_type,
           'prompt', c.prompt,
           'choices', case when c.clue_type = 'MULTIPLE_CHOICE' then c.choices else '[]'::jsonb end,
           'contentTargetKind', c.content_target_kind
         )
    from public.explore_treasure_clues c
   where c.hunt_id = p_hunt_id
     and c.sort_order = p_progress + 1
   limit 1;
$$;

revoke execute on function public.play_next_clue_payload(text, integer) from public, anon, authenticated;

create or replace function public.get_treasure_detail(p_hunt_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_hunt public.explore_treasure_hunts%rowtype;
  v_host public.profiles%rowtype;
  v_progress integer := 0;
  v_completed boolean := false;
  v_claimed boolean := false;
  v_total integer;
begin
  select * into v_hunt from public.explore_treasure_hunts where id = p_hunt_id;
  if v_hunt.id is null or v_hunt.visibility <> 'public' then
    raise exception 'hunt not found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_total
    from public.explore_treasure_clues c where c.hunt_id = p_hunt_id;

  select * into v_host from public.profiles where id = v_hunt.creator_id;

  if v_viewer is not null then
    select coalesce(p.progress, 0), (p.completed_at is not null)
      into v_progress, v_completed
      from public.explore_treasure_progress p
     where p.hunt_id = p_hunt_id and p.profile_id = v_viewer;
    v_progress := coalesce(v_progress, 0);
    v_completed := coalesce(v_completed, false);
    v_claimed := exists (
      select 1 from public.explore_treasure_reward_claims c
       where c.hunt_id = p_hunt_id and c.profile_id = v_viewer
    );
  end if;

  return jsonb_build_object(
    'id', v_hunt.id,
    'title', v_hunt.title,
    'description', v_hunt.description,
    'huntType', v_hunt.hunt_type,
    'countryCode', v_hunt.country_code,
    'status', v_hunt.status,
    'coverUrl', v_hunt.cover_url,
    'teaser', v_hunt.clue,
    'clueCount', greatest(v_hunt.clue_count, coalesce(v_total, 0)),
    'giftsRemaining', v_hunt.gifts_remaining,
    'endsAt', v_hunt.ends_at,
    'rewardType', v_hunt.reward_type,
    'rewardLabel', coalesce(v_hunt.reward_metadata ->> 'label', v_hunt.reward_type::text),
    'progress', v_progress,
    'completed', v_completed,
    'claimed', v_claimed,
    'joined', v_viewer is not null and exists (
      select 1 from public.explore_treasure_progress p
       where p.hunt_id = p_hunt_id and p.profile_id = v_viewer
    ),
    'host', case when v_host.id is null then null else jsonb_build_object(
      'id', v_host.id, 'handle', v_host.handle, 'name', v_host.name, 'avatarTint', v_host.avatar_tint
    ) end,
    'currentClue', case
      when v_completed then null
      else public.play_next_clue_payload(p_hunt_id, v_progress)
    end
  );
end;
$$;

revoke execute on function public.get_treasure_detail(text) from public;
grant execute on function public.get_treasure_detail(text) to anon, authenticated;

create or replace function public.submit_treasure_answer(
  p_hunt_id text,
  p_clue_id text,
  p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_hunt public.explore_treasure_hunts%rowtype;
  v_clue public.explore_treasure_clues%rowtype;
  v_progress integer := 0;
  v_total integer;
  v_digest text;
  v_correct boolean := false;
begin
  if v_user is null then
    raise exception 'sign in to answer' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'treasure_answer', 40, interval '10 minutes');

  select * into v_hunt from public.explore_treasure_hunts where id = p_hunt_id for update;
  if v_hunt.id is null or v_hunt.visibility <> 'public' or v_hunt.status <> 'active' or v_hunt.ends_at <= now() then
    raise exception 'hunt not open' using errcode = 'P0003';
  end if;

  select * into v_clue from public.explore_treasure_clues where id = p_clue_id and hunt_id = p_hunt_id;
  if v_clue.id is null then
    raise exception 'clue not found' using errcode = 'P0002';
  end if;
  if v_clue.clue_type = 'CONTENT_FIND' then
    raise exception 'use content find' using errcode = 'P0004';
  end if;

  insert into public.explore_treasure_progress (hunt_id, profile_id, progress)
  values (p_hunt_id, v_user, 0)
  on conflict (hunt_id, profile_id) do nothing;

  select progress into v_progress
    from public.explore_treasure_progress
   where hunt_id = p_hunt_id and profile_id = v_user;

  if v_clue.sort_order <> v_progress + 1 then
    raise exception 'clue locked' using errcode = 'P0005';
  end if;

  if exists (
    select 1 from public.explore_treasure_clue_progress cp
     where cp.hunt_id = p_hunt_id and cp.profile_id = v_user and cp.clue_id = p_clue_id
  ) then
    return jsonb_build_object(
      'correct', true,
      'progress', v_progress,
      'alreadySolved', true,
      'completed', false,
      'nextClue', public.play_next_clue_payload(p_hunt_id, v_progress)
    );
  end if;

  v_digest := public.explore_answer_digest(p_clue_id, p_answer);
  v_correct := (v_digest = v_clue.answer_digest);

  if not v_correct then
    return jsonb_build_object('correct', false, 'progress', v_progress);
  end if;

  insert into public.explore_treasure_clue_progress (hunt_id, profile_id, clue_id)
  values (p_hunt_id, v_user, p_clue_id)
  on conflict (hunt_id, profile_id, clue_id) do nothing;

  select count(*)::integer into v_total
    from public.explore_treasure_clues where hunt_id = p_hunt_id;

  v_progress := v_progress + 1;
  update public.explore_treasure_progress
     set progress = v_progress,
         completed_at = case when v_progress >= v_total then now() else null end
   where hunt_id = p_hunt_id and profile_id = v_user;

  if v_progress >= v_total then
    perform public.play_notify(v_user, null, 'treasure_complete', p_hunt_id);
  end if;

  return jsonb_build_object(
    'correct', true,
    'progress', v_progress,
    'completed', v_progress >= v_total,
    'clueCount', v_total,
    'nextClue', case
      when v_progress >= v_total then null
      else public.play_next_clue_payload(p_hunt_id, v_progress)
    end
  );
end;
$$;

revoke execute on function public.submit_treasure_answer(text, text, text) from public;
grant execute on function public.submit_treasure_answer(text, text, text) to authenticated;

create or replace function public.complete_content_clue(
  p_hunt_id text,
  p_clue_id text,
  p_content_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_clue public.explore_treasure_clues%rowtype;
  v_hunt public.explore_treasure_hunts%rowtype;
  v_progress integer := 0;
  v_total integer;
  v_ok boolean := false;
begin
  if v_user is null then
    raise exception 'sign in' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'treasure_content_clue', 40, interval '10 minutes');

  select * into v_hunt from public.explore_treasure_hunts where id = p_hunt_id for update;
  if v_hunt.id is null or v_hunt.status <> 'active' or v_hunt.ends_at <= now() then
    raise exception 'hunt not open' using errcode = 'P0003';
  end if;

  select * into v_clue from public.explore_treasure_clues
   where id = p_clue_id and hunt_id = p_hunt_id and clue_type = 'CONTENT_FIND';
  if v_clue.id is null then
    raise exception 'clue not found' using errcode = 'P0002';
  end if;

  insert into public.explore_treasure_progress (hunt_id, profile_id, progress)
  values (p_hunt_id, v_user, 0)
  on conflict (hunt_id, profile_id) do nothing;

  select progress into v_progress from public.explore_treasure_progress
   where hunt_id = p_hunt_id and profile_id = v_user;

  if v_clue.sort_order <> v_progress + 1 then
    raise exception 'clue locked' using errcode = 'P0005';
  end if;

  if p_content_id is distinct from v_clue.content_target_id then
    return jsonb_build_object('correct', false, 'progress', v_progress);
  end if;

  if v_clue.content_target_kind = 'take' then
    v_ok := exists (
      select 1 from public.takes t
       where t.id = v_clue.content_target_id
         and t.status = 'active'
         and t.expires_at > now()
         and not public.explore_actor_hidden(v_user, t.author_id)
    );
  elsif v_clue.content_target_kind = 'vault_drop' then
    v_ok := exists (
      select 1 from public.explore_vault_preview_rows(v_user, null, 100) r
       where r.drop_id = v_clue.content_target_id
    );
  elsif v_clue.content_target_kind = 'challenge' then
    v_ok := exists (
      select 1 from public.explore_challenges c
       where c.id = v_clue.content_target_id and c.visibility = 'public'
    );
  elsif v_clue.content_target_kind = 'creator' then
    v_ok := exists (
      select 1 from public.profiles p where p.id = v_clue.content_target_id
    );
  end if;

  if not v_ok then
    return jsonb_build_object('correct', false, 'progress', v_progress);
  end if;

  insert into public.explore_treasure_clue_progress (hunt_id, profile_id, clue_id)
  values (p_hunt_id, v_user, p_clue_id)
  on conflict (hunt_id, profile_id, clue_id) do nothing;

  select count(*)::integer into v_total from public.explore_treasure_clues where hunt_id = p_hunt_id;
  v_progress := v_progress + 1;
  update public.explore_treasure_progress
     set progress = v_progress,
         completed_at = case when v_progress >= v_total then now() else null end
   where hunt_id = p_hunt_id and profile_id = v_user;

  if v_progress >= v_total then
    perform public.play_notify(v_user, null, 'treasure_complete', p_hunt_id);
  end if;

  return jsonb_build_object(
    'correct', true,
    'progress', v_progress,
    'completed', v_progress >= v_total,
    'clueCount', v_total,
    'nextClue', case
      when v_progress >= v_total then null
      else public.play_next_clue_payload(p_hunt_id, v_progress)
    end
  );
end;
$$;

revoke execute on function public.complete_content_clue(text, text, text) from public;
grant execute on function public.complete_content_clue(text, text, text) to authenticated;

create or replace function public.claim_treasure_reward(p_hunt_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_hunt public.explore_treasure_hunts%rowtype;
  v_claim public.explore_treasure_reward_claims%rowtype;
  v_prog public.explore_treasure_progress%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to claim' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'treasure_claim', 20, interval '1 hour');

  select * into v_hunt from public.explore_treasure_hunts where id = p_hunt_id for update;
  if v_hunt.id is null then
    raise exception 'hunt not found' using errcode = 'P0002';
  end if;

  select * into v_prog from public.explore_treasure_progress
   where hunt_id = p_hunt_id and profile_id = v_user;
  if v_prog.completed_at is null then
    raise exception 'hunt incomplete' using errcode = 'P0003';
  end if;

  select * into v_claim from public.explore_treasure_reward_claims
   where hunt_id = p_hunt_id and profile_id = v_user;
  if v_claim.hunt_id is not null then
    return jsonb_build_object(
      'claimed', true,
      'alreadyClaimed', true,
      'rewardType', v_claim.reward_type,
      'rewardMetadata', v_claim.reward_metadata
    );
  end if;

  if v_hunt.gifts_remaining is not null then
    if v_hunt.gifts_remaining <= 0 then
      raise exception 'no gifts remaining' using errcode = 'P0004';
    end if;
    update public.explore_treasure_hunts
       set gifts_remaining = gifts_remaining - 1
     where id = p_hunt_id and gifts_remaining > 0;
    if not found then
      raise exception 'no gifts remaining' using errcode = 'P0004';
    end if;
  end if;

  insert into public.explore_treasure_reward_claims
    (hunt_id, profile_id, reward_type, reward_metadata)
  values (p_hunt_id, v_user, v_hunt.reward_type, v_hunt.reward_metadata)
  returning * into v_claim;

  perform public.play_notify(v_user, null, 'treasure_reward', p_hunt_id);

  return jsonb_build_object(
    'claimed', true,
    'alreadyClaimed', false,
    'rewardType', v_claim.reward_type,
    'rewardMetadata', v_claim.reward_metadata,
    'giftsRemaining', (select gifts_remaining from public.explore_treasure_hunts where id = p_hunt_id)
  );
end;
$$;

revoke execute on function public.claim_treasure_reward(text) from public;
grant execute on function public.claim_treasure_reward(text) to authenticated;

create or replace function public.get_my_play()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
begin
  if v_user is null then
    return jsonb_build_object(
      'challenges', '[]'::jsonb,
      'treasures', '[]'::jsonb,
      'rewards', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'title', c.title,
               'status', c.status,
               'coverUrl', c.cover_url,
               'endsAt', c.ends_at,
               'hasEntry', e.id is not null,
               'entryId', e.id,
               'challengeType', c.challenge_type
             ) order by c.ends_at asc)
        from public.explore_challenge_participants p
        join public.explore_challenges c on c.id = p.challenge_id
        left join public.explore_challenge_entries e
          on e.challenge_id = c.id and e.profile_id = v_user
       where p.profile_id = v_user
    ), '[]'::jsonb),
    'treasures', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'title', t.title,
               'status', t.status,
               'coverUrl', t.cover_url,
               'progress', p.progress,
               'clueCount', t.clue_count,
               'completed', p.completed_at is not null,
               'endsAt', t.ends_at,
               'huntType', t.hunt_type
             ) order by t.ends_at asc)
        from public.explore_treasure_progress p
        join public.explore_treasure_hunts t on t.id = p.hunt_id
       where p.profile_id = v_user
    ), '[]'::jsonb),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'huntId', c.hunt_id,
               'rewardType', c.reward_type,
               'rewardMetadata', c.reward_metadata,
               'claimedAt', c.claimed_at,
               'title', t.title,
               'coverUrl', t.cover_url
             ) order by c.claimed_at desc)
        from public.explore_treasure_reward_claims c
        join public.explore_treasure_hunts t on t.id = c.hunt_id
       where c.profile_id = v_user
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_my_play() from public;
grant execute on function public.get_my_play() to authenticated;
