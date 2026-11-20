begin;
do $$ begin
  if to_regprocedure('public.creator_live_viewer_can_access_internal(text,text)') is null
     or to_regprocedure('public.vault_profiles_blocked_internal(text,text)') is null then
    raise exception 'visibility-helper hardening prerequisite missing';
  end if;
end $$;
-- LIVE-CONNECT-B2: source-only proposal. No new hosting/viewer admission.
-- Apply only after complete visibility-helper hardening and isolated SQL acceptance.
-- An approval records independently reviewed EXISTING participation, never presence,
-- visibility or a ballot. There is deliberately no client approval RPC/backfill.
create table public.creator_live_continuation_approvals (
  session_id text not null references public.creator_live_sessions(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  capability text not null check (capability in ('HOST','VIEWER')),
  evidence_ref text not null check (length(trim(evidence_ref)) between 1 and 200),
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key (session_id, profile_id, capability),
  check (expires_at > approved_at)
);
alter table public.creator_live_continuation_approvals enable row level security;
revoke all on table public.creator_live_continuation_approvals from public, anon, authenticated, service_role;
comment on table public.creator_live_continuation_approvals is
  'Reviewed existing-session continuation only; empty on installation; no automatic legacy approval.';

-- For capability display only. Mutation authorization below locks the approval.
create or replace function public.creator_live_continuation_allowed(
  p_session_id text, p_profile_id text, p_capability text
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.creator_live_continuation_approvals a
    where a.session_id=p_session_id and a.profile_id=p_profile_id
      and a.capability=p_capability and a.revoked_at is null
      and a.approved_at <= statement_timestamp() and a.expires_at > statement_timestamp());
$$;
revoke all on function public.creator_live_continuation_allowed(text,text,text)
  from public,anon,authenticated,service_role;

-- Must be called after session lock. SHARE prevents a concurrent approval
-- revocation/expiry edit from committing before this transaction finishes.
create or replace function public.assert_creator_live_continuation(
  p_session_id text, p_profile_id text, p_capability text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_approval public.creator_live_continuation_approvals%rowtype;
begin
  if p_profile_id is null or p_profile_id is distinct from public.my_profile_id() then
    raise exception 'current actor required' using errcode='42501';
  end if;
  select * into v_approval from public.creator_live_continuation_approvals a
    where a.session_id=p_session_id and a.profile_id=p_profile_id
      and a.capability=p_capability
    for share;
  -- Evaluate time AFTER any wait for the approval lock, never in its scan filter.
  if not found or v_approval.revoked_at is not null
     or v_approval.approved_at > clock_timestamp()
     or v_approval.expires_at <= clock_timestamp() then
    raise exception 'creator Live new admission is deferred' using errcode='P0006';
  end if;
end;
$$;
revoke all on function public.assert_creator_live_continuation(text,text,text)
  from public,anon,authenticated,service_role;

create or replace function public.creator_live_session_card(
  p_session public.creator_live_sessions,
  p_viewer  text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_creator public.profiles%rowtype;
  v_media   public.media_objects%rowtype;
  v_access  boolean := public.creator_live_viewer_can_access_internal(p_session.id, p_viewer);
  v_owner   boolean := p_viewer is not null and p_viewer = p_session.creator_id;
  v_watch   integer := 0;
begin
  select * into v_creator from public.profiles where id = p_session.creator_id;
  if p_session.cover_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_session.cover_media_object_id;
  end if;
  if p_session.status = 'LIVE' then
    select count(*) into v_watch
      from public.creator_live_viewers w
     where w.session_id = p_session.id
       and w.last_seen_at > now() - interval '45 seconds';
  end if;

  return jsonb_build_object(
    'id', p_session.id,
    'title', p_session.title,
    'description', p_session.description,
    'access', p_session.access,
    'status', p_session.status,
    'provider', p_session.provider,
    -- The stream URL only ever leaves the database for a viewer allowed to
    -- watch: entitlement is enforced here, never by hiding UI.
    'streamUrl', case when v_access and p_session.status = 'LIVE' then p_session.stream_url else null end,
    'creatorId', p_session.creator_id,
    'creatorName', v_creator.name,
    'creatorHandle', v_creator.handle,
    'creatorTint', v_creator.avatar_tint,
    'permissions', jsonb_build_object(
      'polls', p_session.allow_polls,
      'choices', p_session.allow_choices,
      'crowdActions', p_session.allow_crowd_actions,
      'gameActions', p_session.allow_game_actions
    ),
    'coverMedia', case
      when v_media.id is null or v_media.status <> 'ready' or v_media.deleted_at is not null then null
      else jsonb_build_object('bucket', v_media.bucket, 'path', v_media.storage_path, 'kind', v_media.media_kind)
    end,
    'scheduledAt', p_session.scheduled_at,
    'startedAt', p_session.started_at,
    'endedAt', p_session.ended_at,
    'createdAt', p_session.created_at,
    'viewerAccess', v_access,
    'isOwner', v_owner,
    'canParticipate', p_viewer is not null and v_access
      and p_session.status = 'LIVE' and not v_owner
      and public.creator_live_continuation_allowed(p_session.id,p_viewer,'VIEWER'),
    'watching', v_watch
  );
end;
$$;

create or replace function public.create_creator_live_session(
  p_title                 text,
  p_description           text default '',
  p_access                public.creator_live_access default 'FREE',
  p_scheduled_at          timestamptz default null,
  p_cover_media_object_id text default null,
  p_allow_polls           boolean default true,
  p_allow_choices         boolean default true,
  p_allow_crowd_actions   boolean default false,
  p_allow_game_actions    boolean default false,
  p_stream_url            text default null,
  p_provider              text default 'standby'
)
returns public.creator_live_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_vault   public.creator_vaults%rowtype;
  v_media   public.media_objects%rowtype;
  v_title   text := coalesce(trim(p_title), '');
  v_desc    text := coalesce(trim(p_description), '');
  v_stream  text := nullif(trim(coalesce(p_stream_url, '')), '');
  v_row     public.creator_live_sessions%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to go live' using errcode = '42501';
  end if;
  -- Validation reads remain testable; new admission below is unconditionally closed.

  select * into v_vault from public.creator_vaults where creator_id = v_creator and status = 'active';
  if not found then
    raise exception 'open your vault first' using errcode = 'P0006';
  end if;
  if v_title = '' or char_length(v_title) > 120 then
    raise exception 'a title must be 1-120 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 400 then
    raise exception 'a description must be 400 characters or fewer' using errcode = 'P0003';
  end if;
  if p_provider not in ('standby', 'hls', 'file', 'embed') then
    raise exception 'unsupported provider' using errcode = 'P0003';
  end if;
  if p_provider <> 'standby' and (v_stream is null or v_stream !~ '^https://') then
    raise exception 'a real provider needs an https stream url' using errcode = 'P0003';
  end if;

  if p_cover_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_cover_media_object_id;
    if v_media.id is null or v_media.owner_id is distinct from v_creator
       or v_media.status is distinct from 'ready' or v_media.deleted_at is not null
       or v_media.visibility is distinct from 'public' or v_media.bucket is distinct from 'public-media' then
      raise exception 'attach a finished public upload you own' using errcode = 'P0004';
    end if;
  end if;

  raise exception 'creator Live new hosting is deferred' using errcode='P0006';
end;
$$;

create or replace function public.start_creator_live_session(p_session_id text)
returns public.creator_live_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     text := public.my_profile_id();
  v_row       public.creator_live_sessions%rowtype;
  v_recipient text;
begin
  if v_actor is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  select * into v_row from public.creator_live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  -- Only the owning creator (or staff, for moderation) may change lifecycle.
  if v_row.creator_id <> v_actor and not public.is_staff() then
    raise exception 'not your session' using errcode = 'P0001';
  end if;
  if v_row.status = 'LIVE' then
    return v_row;
  end if;
  if v_row.status <> 'SCHEDULED' then
    raise exception 'session cannot start' using errcode = 'P0004';
  end if;

  raise exception 'creator Live new hosting is deferred' using errcode='P0006';

end;
$$;

create or replace function public.end_creator_live_session(p_session_id text)
returns public.creator_live_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.my_profile_id();
  v_row   public.creator_live_sessions%rowtype;
  v_open  record;
begin
  if v_actor is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  select * into v_row from public.creator_live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_row.creator_id <> v_actor and not public.is_staff() then
    raise exception 'not your session' using errcode = 'P0001';
  end if;
  if v_row.status in ('ENDED','CANCELLED') then
    return v_row; -- authorized terminal replay: no new event or notification
  end if;
  if v_row.status <> 'LIVE' then
    raise exception 'session is not live' using errcode = 'P0004';
  end if;

  update public.creator_live_sessions
     set status = 'ENDED', ended_at = clock_timestamp(), updated_at = clock_timestamp()
   where id = p_session_id
  returning * into v_row;

  -- Ending a session closes every interaction still on the floor.
  for v_open in
    select i.id from public.creator_live_interactions i
     where i.session_id = p_session_id and i.status in ('OPEN','TRIGGERED') and i.closed_at is null order by i.id
  loop
    perform public.creator_live_close_interaction(v_open.id, v_actor);
  end loop;

  insert into public.creator_live_events (id, session_id, kind, payload)
  values (
    'cle_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
    v_row.id, 'SESSION_ENDED', jsonb_build_object('status', 'ENDED')
  );

  return v_row;
end;
$$;

create or replace function public.create_creator_live_interaction(
  p_session_id       text,
  p_type             public.creator_live_interaction_type,
  p_prompt           text,
  p_options          jsonb default null,
  p_action_kind      public.creator_live_action_kind default null,
  p_threshold        integer default null,
  p_duration_seconds integer default null
)
returns public.creator_live_interactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  text := public.my_profile_id();
  v_session public.creator_live_sessions%rowtype;
  v_prompt text := coalesce(trim(p_prompt), '');
  v_row    public.creator_live_interactions%rowtype;
begin
  if v_actor is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_actor, 'creator_live_interaction', 60, interval '1 hour');

  select * into v_session from public.creator_live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.creator_id <> v_actor then
    raise exception 'not your session' using errcode = 'P0001';
  end if;
  if v_session.status <> 'LIVE' then
    raise exception 'session is not live' using errcode = 'P0004';
  end if;

  perform public.assert_creator_live_continuation(p_session_id, v_actor, 'HOST');

  -- The creator explicitly enables each interaction type. Nothing is implicit.
  if (p_type = 'POLL' and not v_session.allow_polls)
     or (p_type = 'CHOICE' and not v_session.allow_choices)
     or (p_type = 'CROWD_ACTION' and not v_session.allow_crowd_actions)
     or (p_type = 'GAME_ACTION' and not v_session.allow_game_actions) then
    raise exception 'that interaction is not enabled for this session' using errcode = 'P0001';
  end if;

  if v_prompt = '' or char_length(v_prompt) > 160 then
    raise exception 'a prompt must be 1-160 characters' using errcode = 'P0003';
  end if;

  if p_type = 'CROWD_ACTION' then
    if p_action_kind is null then
      raise exception 'a crowd action needs an approved action' using errcode = 'P0003';
    end if;
    if p_threshold is null or p_threshold < 2 or p_threshold > 1000000 then
      raise exception 'a threshold must be between 2 and 1000000' using errcode = 'P0003';
    end if;
  else
    if not public.creator_live_options_valid(p_options) then
      raise exception 'options must be 2-4 named choices' using errcode = 'P0003';
    end if;
  end if;

  insert into public.creator_live_interactions (
    id, session_id, creator_id, type, prompt, options, action_kind, threshold,
    status, closes_at, tallies, total_votes
  ) values (
    'cli_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
    v_session.id, v_actor, p_type, v_prompt, case when p_type = 'CROWD_ACTION' then null else p_options end,
    case when p_type = 'CROWD_ACTION' then p_action_kind else null end,
    case when p_type = 'CROWD_ACTION' then p_threshold else null end,
    'OPEN',
    case when p_duration_seconds is null then null else clock_timestamp() + make_interval(secs => p_duration_seconds) end,
    '{}'::jsonb, 0
  )
  returning * into v_row;

  insert into public.creator_live_events (id, session_id, interaction_id, kind, action_kind, payload)
  values (
    'cle_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
    v_session.id, v_row.id, 'INTERACTION_OPENED',
    v_row.action_kind,
    jsonb_build_object(
      'interactionId', v_row.id,
      'type', v_row.type,
      'prompt', v_row.prompt,
      'options', v_row.options,
      'actionKind', v_row.action_kind,
      'threshold', v_row.threshold,
      'closesAt', v_row.closes_at
    )
  );

  return v_row;
end;
$$;

create or replace function public.creator_live_close_interaction(
  p_interaction_id text,
  p_actor          text
)
returns public.creator_live_interactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.creator_live_sessions%rowtype;
  v_row     public.creator_live_interactions%rowtype;
  v_tallies jsonb;
  v_total   integer;
  v_winner  text;
  v_result  jsonb;
begin
  -- Uniform lifecycle order: session -> interaction -> continuation approval.
  select * into v_session from public.creator_live_sessions
    where id = (select i.session_id from public.creator_live_interactions i where i.id=p_interaction_id)
    for update;
  if not found then
    raise exception 'interaction not found' using errcode='P0002';
  end if;
  if p_actor is null or p_actor is distinct from public.my_profile_id()
     or (v_session.creator_id <> p_actor and not public.is_staff()) then
    raise exception 'not your interaction' using errcode='42501';
  end if;
  select * into v_row from public.creator_live_interactions where id = p_interaction_id for update;
  if not found then
    raise exception 'interaction not found' using errcode = 'P0002';
  end if;
  if v_row.closed_at is not null or v_row.status not in ('OPEN','TRIGGERED') then
    return v_row;
  end if;

  -- Totals always come from the votes table, never from a stored counter that a
  -- client could have influenced.
  select
    coalesce(jsonb_object_agg(option_key, c), '{}'::jsonb),
    coalesce(sum(c), 0)
    into v_tallies, v_total
    from (
      select coalesce(v.option_id, 'support') as option_key, count(*)::integer as c
        from public.creator_live_votes v
       where v.interaction_id = p_interaction_id
       group by 1
    ) t;

  if v_row.type = 'CROWD_ACTION' then
    v_result := jsonb_build_object(
      'supports', v_total,
      'threshold', v_row.threshold,
      'triggered', v_row.status = 'TRIGGERED' or v_total >= coalesce(v_row.threshold, 2147483647),
      'actionKind', v_row.action_kind
    );
  else
    select k into v_winner
      from (
        select coalesce(v.option_id, 'support') as k, count(*) as c
          from public.creator_live_votes v
         where v.interaction_id = p_interaction_id
         group by 1
         order by c desc, k asc
         limit 1
      ) w;
    v_result := jsonb_build_object(
      'tallies', v_tallies,
      'total', v_total,
      'winner', v_winner,
      'tie', v_total > 0 and (
        select count(*) > 1 from (
          select count(*) as c from public.creator_live_votes
           where interaction_id = p_interaction_id group by coalesce(option_id, 'support')
        ) d where d.c = (select max(m.c) from (
          select count(*) as c from public.creator_live_votes
           where interaction_id = p_interaction_id group by coalesce(option_id, 'support')
        ) m)
      )
    );
  end if;

  if v_row.type <> 'CROWD_ACTION' then
    if coalesce((v_result->>'tie')::boolean,false) or v_total=0 then
      v_result := jsonb_set(v_result, '{winner}', 'null'::jsonb);
    end if;
    v_result := v_result || jsonb_build_object('outcome',
      case when v_total=0 then 'NO_BALLOTS'
        when (v_result->>'tie')::boolean then 'TIE' else 'WINNER' end);
  end if;

  update public.creator_live_interactions
     set tallies = v_tallies,
         total_votes = v_total,
         result = v_result,
         closed_at = clock_timestamp(),
         status = (case when status = 'TRIGGERED' then 'TRIGGERED' else 'CLOSED' end)::public.creator_live_interaction_status
   where id = p_interaction_id
  returning * into v_row;

  insert into public.creator_live_events (id, session_id, interaction_id, kind, action_kind, payload)
  values (
    'cle_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
    v_row.session_id, v_row.id, 'INTERACTION_CLOSED', v_row.action_kind,
    jsonb_build_object('interactionId', v_row.id, 'status', v_row.status, 'result', v_result)
  );

  return v_row;
end;
$$;

create or replace function public.creator_live_interaction_card(
  p_interaction public.creator_live_interactions,
  p_viewer      text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session  public.creator_live_sessions%rowtype;
  v_owner    boolean;
  v_access   boolean;
  v_voted    boolean := false;
  v_my_vote  text;
  v_open     boolean;
begin
  select * into v_session from public.creator_live_sessions where id = p_interaction.session_id;
  v_owner  := p_viewer is not null and p_viewer = p_interaction.creator_id;
  v_access := public.creator_live_viewer_can_access_internal(p_interaction.session_id, p_viewer);

  if p_viewer is not null then
    select true, v.option_id into v_voted, v_my_vote
      from public.creator_live_votes v
     where v.interaction_id = p_interaction.id and v.profile_id = p_viewer;
    v_voted := coalesce(v_voted, false);
  end if;

  v_open := p_interaction.status = 'OPEN'
            and (p_interaction.closes_at is null or p_interaction.closes_at > statement_timestamp());

  return jsonb_build_object(
    'id', p_interaction.id,
    'sessionId', p_interaction.session_id,
    'type', p_interaction.type,
    'prompt', p_interaction.prompt,
    'options', p_interaction.options,
    'actionKind', p_interaction.action_kind,
    'threshold', p_interaction.threshold,
    'status', p_interaction.status,
    'openedAt', p_interaction.opened_at,
    'closesAt', p_interaction.closes_at,
    'closedAt', p_interaction.closed_at,
    'triggeredAt', p_interaction.triggered_at,
    -- Aggregates only: never another viewer's vote.
    'tallies', p_interaction.tallies,
    'totalVotes', p_interaction.total_votes,
    'triggered', p_interaction.status = 'TRIGGERED',
    'result', case when p_interaction.status = 'OPEN' then null else p_interaction.result end,
    'voted', v_voted,
    'myVote', v_my_vote,
    'canParticipate', p_viewer is not null
      and v_access
      and v_session.status = 'LIVE'
      and not v_owner
      and v_open
      and public.creator_live_continuation_allowed(p_interaction.session_id,p_viewer,'VIEWER')
  );
end;
$$;

create or replace function public.submit_creator_live_vote(
  p_interaction_id text,
  p_option_id      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     text := public.my_profile_id();
  v_row      public.creator_live_interactions%rowtype;
  v_session  public.creator_live_sessions%rowtype;
  v_existing text;
  v_option   text := nullif(trim(coalesce(p_option_id, '')), '');
  v_tallies  jsonb;
  v_total    integer;
  v_fired    boolean := false;
begin
  if v_user is null then
    raise exception 'sign in to take part' using errcode = '42501';
  end if;
  -- Uniform lifecycle order: session -> interaction -> continuation approval.
  select * into v_session from public.creator_live_sessions
    where id = (select i.session_id from public.creator_live_interactions i where i.id=p_interaction_id)
    for update;
  if not found then
    raise exception 'interaction not found' using errcode='P0002';
  end if;

  if not public.creator_live_viewer_can_access_internal(v_session.id, v_user) then
    raise exception 'not permitted to take part' using errcode='P0001';
  end if;
  if v_session.creator_id=v_user then
    raise exception 'the creator does not vote' using errcode='P0001';
  end if;
  -- Approval is checked after the interaction lock below.

  -- One row lock per interaction: concurrent supports can neither double-count
  -- nor fire the same threshold twice.
  select * into v_row from public.creator_live_interactions where id = p_interaction_id for update;
  if not found then
    raise exception 'interaction not found' using errcode = 'P0002';
  end if;
  if v_row.type = 'CROWD_ACTION' then
    v_option := null; -- a support carries no option, and nothing else is accepted
  end if;

  perform public.assert_creator_live_continuation(v_session.id,v_user,'VIEWER');

  if v_session.access='SUBSCRIBER' and v_session.creator_id <> v_user
     and not public.is_staff() and not exists (
    select 1 from public.vault_subscriptions s
    where s.vault_id=v_session.vault_id and s.subscriber_id=v_user
      and s.status in ('active','trial') and s.current_period_end > clock_timestamp()
  ) then
    raise exception 'not permitted to take part' using errcode='P0001';
  end if;
  if v_session.status='CANCELLED' then
    raise exception 'session cancelled' using errcode='P0004';
  end if;
  -- Renew visibility before any aggregate replay. Admission never derives from a ballot.
  if not public.creator_live_viewer_can_access_internal(v_session.id,v_user) then
    raise exception 'not permitted to take part' using errcode='P0001';
  end if;
  -- Authorized, approved replay is effect-free, including after closure.
  -- Revocation must fail; idempotency is not a privacy bypass.
  select v.option_id into v_existing
    from public.creator_live_votes v
   where v.interaction_id = p_interaction_id and v.profile_id = v_user;
  if found then
    return jsonb_build_object(
      'accepted', v_existing is not distinct from v_option,
      'alreadyVoted', true,
      'myVote', v_existing,
      'total', v_row.total_votes,
      'tallies', v_row.tallies,
      'triggered', v_row.status = 'TRIGGERED',
      'actionKind', case when v_row.status = 'TRIGGERED' then v_row.action_kind else null end,
      'status', v_row.status
    );
  end if;

  select * into v_session from public.creator_live_sessions where id = v_row.session_id;
  if v_session.status <> 'LIVE' then
    raise exception 'session is not live' using errcode = 'P0004';
  end if;
  if not public.creator_live_viewer_can_access_internal(v_row.session_id, v_user) then
    raise exception 'not permitted to take part' using errcode = 'P0001';
  end if;
  if v_row.creator_id = v_user then
    raise exception 'the creator does not vote' using errcode = 'P0001';
  end if;
  if v_row.status <> 'OPEN' then
    raise exception 'interaction has closed' using errcode = 'P0004';
  end if;
  if v_row.closes_at is not null and v_row.closes_at <= clock_timestamp() then
    raise exception 'interaction has closed' using errcode = 'P0004';
  end if;

  if v_row.type = 'CROWD_ACTION' then
    null; -- a support carries no option
  elsif v_option is null or not exists (
    select 1 from jsonb_array_elements(coalesce(v_row.options, '[]'::jsonb)) e
     where e ->> 'id' = v_option
  ) then
    raise exception 'unknown option' using errcode = 'P0003';
  end if;

  perform public.assert_rate_limit(v_user, 'creator_live_vote', 120, interval '1 hour');
  -- Rate-limit row contention may itself cross the deadline or approval expiry.
  perform public.assert_creator_live_continuation(v_session.id,v_user,'VIEWER');

  if v_session.access='SUBSCRIBER' and v_session.creator_id <> v_user
     and not public.is_staff() and not exists (
    select 1 from public.vault_subscriptions s
    where s.vault_id=v_session.vault_id and s.subscriber_id=v_user
      and s.status in ('active','trial') and s.current_period_end > clock_timestamp()
  ) then
    raise exception 'not permitted to take part' using errcode='P0001';
  end if;

  if not public.creator_live_viewer_can_access_internal(v_session.id,v_user) then
    raise exception 'not permitted to take part' using errcode='P0001';
  end if;
  if v_row.closes_at is not null and v_row.closes_at <= clock_timestamp() then
    raise exception 'interaction has closed' using errcode='P0004';
  end if;

  insert into public.creator_live_votes (interaction_id, profile_id, option_id)
  values (p_interaction_id, v_user, v_option)
  on conflict (interaction_id, profile_id) do nothing;

  -- Recompute from the votes table: the tally is server truth, never an
  -- increment handed over by a client.
  select coalesce(jsonb_object_agg(option_key, c), '{}'::jsonb), coalesce(sum(c), 0)
    into v_tallies, v_total
    from (
      select coalesce(x.option_id, 'support') as option_key, count(*)::integer as c
        from public.creator_live_votes x
       where x.interaction_id = p_interaction_id
       group by 1
    ) t;

  if v_row.type = 'CROWD_ACTION' and v_total >= coalesce(v_row.threshold, 2147483647) then
    update public.creator_live_interactions
       set tallies = v_tallies, total_votes = v_total,
           status = 'TRIGGERED', trigger_count = 1, triggered_at = now()
     where id = p_interaction_id and trigger_count = 0 and status = 'OPEN'
    returning * into v_row;
    v_fired := found;
    if v_fired then
      insert into public.creator_live_events (id, session_id, interaction_id, kind, action_kind, payload)
      values (
        'cle_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
        v_row.session_id, v_row.id, 'ACTION_TRIGGERED', v_row.action_kind,
        jsonb_build_object(
          'interactionId', v_row.id,
          'actionKind', v_row.action_kind,
          'label', v_row.prompt,
          'supports', v_total,
          'threshold', v_row.threshold
        )
      );
    end if;
  else
    update public.creator_live_interactions
       set tallies = v_tallies, total_votes = v_total
     where id = p_interaction_id
    returning * into v_row;
  end if;

  -- Tally pushes are throttled: the first support, then every 25th. A room of a
  -- thousand never produces a thousand broadcasts.
  if v_total = 1 or (v_total % 25) = 0 then
    insert into public.creator_live_events (id, session_id, interaction_id, kind, payload)
    values (
      'cle_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20)),
      v_row.session_id, v_row.id, 'TALLY',
      jsonb_build_object(
        'interactionId', v_row.id, 'total', v_total, 'tallies', v_tallies, 'status', v_row.status
      )
    );
  end if;

  return jsonb_build_object(
    'accepted', true,
    'alreadyVoted', false,
    'myVote', v_option,
    'total', v_total,
    'tallies', v_tallies,
    'triggered', v_row.status = 'TRIGGERED',
    'actionKind', case when v_row.status = 'TRIGGERED' then v_row.action_kind else null end,
    'status', v_row.status
  );
end;
$$;

create or replace function public.touch_creator_live_viewer(p_session_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  text := public.my_profile_id();
  v_live  boolean;
  v_session public.creator_live_sessions%rowtype;
  v_count integer := 0;
begin
  if v_user is null then
    return 0;
  end if;
  select * into v_session from public.creator_live_sessions where id=p_session_id for update;
  v_live := v_session.status='LIVE';
  if v_live is not true then
    return 0;
  end if;
  if not public.creator_live_viewer_can_access_internal(p_session_id, v_user) then
    raise exception 'not permitted' using errcode = 'P0001';
  end if;

  perform public.assert_creator_live_continuation(p_session_id,v_user,
    case when v_session.creator_id=v_user then 'HOST' else 'VIEWER' end);


  if v_session.access='SUBSCRIBER' and v_session.creator_id <> v_user
     and not public.is_staff() and not exists (
    select 1 from public.vault_subscriptions s
    where s.vault_id=v_session.vault_id and s.subscriber_id=v_user
      and s.status in ('active','trial') and s.current_period_end > clock_timestamp()
  ) then
    raise exception 'not permitted to take part' using errcode='P0001';
  end if;

  if not public.creator_live_viewer_can_access_internal(p_session_id,v_user) then
    raise exception 'not permitted' using errcode='P0001';
  end if;
  insert into public.creator_live_viewers (session_id, profile_id, last_seen_at)
  values (p_session_id, v_user, now())
  on conflict (session_id, profile_id)
  do update set last_seen_at = now() where public.creator_live_viewers.session_id = excluded.session_id;

  select count(*) into v_count
    from public.creator_live_viewers w
   where w.session_id = p_session_id
     and w.last_seen_at > now() - interval '45 seconds';
  return v_count;
end;
$$;

-- One STABLE statement snapshot. Events are invalidation hints, not a cursor.
-- Explicit interaction ID recovers an older round outside the recent window.
create or replace function public.get_creator_live_snapshot(
  p_session_id text, p_interaction_id text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer text := public.my_profile_id();
  v_session public.creator_live_sessions%rowtype;
  v_interactions jsonb;
begin
  select * into v_session from public.creator_live_sessions where id=p_session_id;
  if not found or not public.creator_live_viewer_can_access_internal(p_session_id,v_viewer) then
    return null;
  end if;
  select coalesce(jsonb_agg(public.creator_live_interaction_card(i,v_viewer)
    order by i.opened_at desc,i.id),'[]'::jsonb) into v_interactions
  from (select * from public.creator_live_interactions x
    where x.session_id=p_session_id and (p_interaction_id is null or x.id=p_interaction_id)
    order by x.opened_at desc,x.id limit 40) i;
  return jsonb_build_object('session',public.creator_live_session_card(v_session,v_viewer),
    'interactions',v_interactions,'serverTime',statement_timestamp(),
    'interactionWindowComplete',p_interaction_id is not null or
      (select count(*)<=40 from public.creator_live_interactions where session_id=p_session_id));
end;
$$;
revoke all on function public.get_creator_live_snapshot(text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_live_snapshot(text,text) to anon,authenticated;
notify pgrst,'reload schema';

commit;
