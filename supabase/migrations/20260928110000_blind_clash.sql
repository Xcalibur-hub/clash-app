-- ============================================================================
-- CLASH 2.0 · 0021 — Blind Clash (judge the argument before the person)
-- ----------------------------------------------------------------------------
-- Optional Clash mode. STANDARD is the default and the existing engine, verdict
-- and economy are unchanged. BLIND hides participant identity from the
-- authoritative read (`clash_view`) until the viewer is a participant, has
-- judged, or the Clash is settled.
--
-- The clashes table still stores challenger_id (settlement needs it). API roles
-- do not SELECT that column — they read identities only through clash_view.
-- ============================================================================

do $$ begin
  create type public.clash_mode as enum ('STANDARD', 'BLIND');
exception when duplicate_object then null; end $$;

alter table public.clashes
  add column if not exists mode public.clash_mode not null default 'STANDARD';

-- ── Reveal helper (internal; not granted to API roles) ──────────────────────
create or replace function public.clash_identities_revealed_for(
  p_mode         public.clash_mode,
  p_status       public.clash_status,
  p_clash_id     text,
  p_author_id    text,
  p_challenger_id text,
  p_viewer       text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_mode = 'STANDARD'
    or p_status = 'settled'
    or (p_viewer is not null and p_viewer in (p_author_id, p_challenger_id))
    or (
      p_viewer is not null and exists (
        select 1 from public.judgements j
         where j.clash_id = p_clash_id and j.juror_id = p_viewer
      )
    );
$$;

create or replace function public.clash_participant_json(p_profile_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_profile_id is null then null else jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'handle', p.handle,
    'tint', p.avatar_tint
  ) end
  from public.profiles p
  where p.id = p_profile_id;
$$;

-- ── Authoritative read ──────────────────────────────────────────────────────
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
    select cm.text into v_side_b
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
    'sideA', case when v_revealed then public.clash_participant_json(v_clash.author_id) else null end,
    'sideB', case when v_revealed then public.clash_participant_json(v_clash.challenger_id) else null end,
    'verdict', v_verdict
  );
end;
$$;

create or replace function public.clash_view_for_take(p_take_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  select c.id into v_id
    from public.clashes c
   where c.take_id = p_take_id and c.status = 'open'
   order by c.created_at desc
   limit 1;

  if v_id is null then
    select c.id into v_id
      from public.clashes c
     where c.take_id = p_take_id
     order by c.created_at desc
     limit 1;
  end if;

  if v_id is null then
    return null;
  end if;
  return public.clash_view(v_id);
end;
$$;

-- Profile history: omit open Blind matchups from strangers; never return an
-- opponent id the viewer is not allowed to see.
create or replace function public.profile_clash_list(p_profile_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_out jsonb := '[]'::jsonb;
  r record;
  v_author text;
  v_take_text text;
  v_opponent text;
  v_revealed boolean;
  v_verdict jsonb;
  v_outcome text;
begin
  for r in
    select c.*, t.author_id, t.text as take_text
      from public.clashes c
      join public.takes t on t.id = c.take_id
     where c.challenger_id = p_profile_id or t.author_id = p_profile_id
     order by c.created_at desc
     limit 30
  loop
    if r.mode = 'BLIND' and r.status = 'open'
       and (v_viewer is null or v_viewer not in (r.author_id, r.challenger_id)) then
      continue;
    end if;

    v_revealed := public.clash_identities_revealed_for(
      r.mode, r.status, r.id, r.author_id, r.challenger_id, v_viewer
    );
    v_opponent := case
      when not v_revealed then null
      when r.author_id = p_profile_id then r.challenger_id
      else r.author_id
    end;

    v_verdict := null;
    v_outcome := null;
    if r.status = 'settled' then
      select jsonb_build_object(
        'clashId', v.clash_id,
        'winnerSide', v.winner_side,
        'sideAScore', v.side_a_score,
        'sideBScore', v.side_b_score,
        'jurySize', v.jury_size,
        'agreement', v.agreement,
        'margin', v.margin,
        'verdictLabel', v.verdict_label
      ),
      case
        when v.winner_side = 'DRAW' then 'draw'
        when r.author_id = p_profile_id and v.winner_side = 'A' then 'won'
        when r.challenger_id = p_profile_id and v.winner_side = 'B' then 'won'
        else 'lost'
      end
      into v_verdict, v_outcome
      from public.verdicts v
      where v.clash_id = r.id;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'clashId', r.id,
      'takeId', r.take_id,
      'status', r.status,
      'mode', r.mode,
      'createdAt', r.created_at,
      'closesAt', r.closes_at,
      'takeText', r.take_text,
      'opponentId', v_opponent,
      'verdict', v_verdict,
      'outcome', v_outcome
    ));
  end loop;

  return v_out;
end;
$$;

-- ── start_clash: optional mode, default STANDARD (same 2-arg calls still work)
drop function if exists public.start_clash(text, text);

create function public.start_clash(
  p_take_id     text,
  p_comment_id  text default null,
  p_mode        public.clash_mode default 'STANDARD'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenger text := public.my_profile_id();
  v_take public.takes%rowtype;
  v_clash_id text;
  v_mode public.clash_mode := coalesce(p_mode, 'STANDARD');
begin
  if v_challenger is null then
    raise exception 'sign in to start a clash' using errcode = '42501';
  end if;

  select * into v_take from public.takes where id = p_take_id;

  if v_take.id is null then
    raise exception 'take does not exist' using errcode = 'P0002';
  end if;
  if v_take.author_id = v_challenger then
    raise exception 'cannot clash your own take' using errcode = 'P0001';
  end if;
  if v_take.status <> 'active' or v_take.expires_at <= now() then
    raise exception 'take is not live' using errcode = 'P0003';
  end if;

  if p_comment_id is not null and not exists (
    select 1 from public.comments
     where id = p_comment_id and take_id = p_take_id
       and author_id = v_challenger and not is_removed
  ) then
    raise exception 'comment is not yours or not on this take' using errcode = 'P0004';
  end if;

  if exists (
    select 1 from public.clashes
     where take_id = p_take_id and challenger_id = v_challenger and status = 'open'
  ) then
    raise exception 'you already have an open clash on this take' using errcode = 'P0005';
  end if;

  v_clash_id := 'cl_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20));

  insert into public.clashes (id, take_id, challenger_id, challenger_comment_id, status, mode, opens_at, closes_at)
  values (v_clash_id, p_take_id, v_challenger, p_comment_id, 'open', v_mode, now(), v_take.expires_at);

  perform public.clash_notify(v_take.author_id, v_challenger, 'clash_started', v_clash_id);

  return v_clash_id;
end;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on function public.clash_identities_revealed_for(public.clash_mode, public.clash_status, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.clash_participant_json(text) from public, anon, authenticated;

grant execute on function public.clash_view(text) to anon, authenticated;
grant execute on function public.clash_view_for_take(text) to anon, authenticated;
grant execute on function public.profile_clash_list(text) to anon, authenticated;
revoke execute on function public.clash_view(text) from public;
revoke execute on function public.clash_view_for_take(text) from public;
revoke execute on function public.profile_clash_list(text) from public;

grant execute on function public.start_clash(text, text, public.clash_mode) to authenticated;
revoke execute on function public.start_clash(text, text, public.clash_mode) from public, anon;

-- Hide participant identity columns from API roles. Settlement still uses them
-- as the table owner. clash_view is the public identity path.
revoke select on public.clashes from anon, authenticated;
grant select (id, take_id, status, mode, opens_at, closes_at, created_at, settled_at)
  on public.clashes to anon, authenticated;
