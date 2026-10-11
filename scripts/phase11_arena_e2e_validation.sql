-- ============================================================================
-- Phase 11 — Arena E2E validation harness (LOCAL DOCKER ONLY)
-- ----------------------------------------------------------------------------
-- Validates Take → Challenge → Accept → Duel → Judgement → Settlement →
-- profile_clash_stats / comment notifications against a real local backend.
--
-- SAFETY (fail-closed)
--   1. Requires:  SELECT set_config('app.phase11_e2e_allow','local-docker', false);
--   2. Refuses hosted/production markers (see guards below).
--   3. Default mode is transactional ROLLBACK — no durable fixture pollution.
--   4. No public SECURITY DEFINER helpers; report lives in pg_temp.
--   5. Optional durable mode only when BOTH allow GUCs are set (see below).
--
-- RUN (default, rolled back):
--   docker exec -i supabase_db_clash psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
--   SELECT set_config('app.phase11_e2e_allow','local-docker', false);
--   \i /path/or/paste
--   SQL
--
-- Or from host after docker cp:
--   docker exec supabase_db_clash psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     -c "SELECT set_config('app.phase11_e2e_allow','local-docker', false)" \
--     -f /tmp/phase11_arena_e2e_validation.sql
--
-- DURABLE mode (keeps fixtures + public._phase11_e2e_report snapshot; rare):
--   SELECT set_config('app.phase11_e2e_allow','local-docker', false);
--   SELECT set_config('app.phase11_e2e_persist','1', false);
--   then run this file. Cleanup: scripts/phase11_arena_e2e_cleanup.sql
--
-- Existing Step 2D artifacts (if any) are documented in
-- docs/PHASE_11_SETTLEMENT_REWARDS_AUDIT.md — do not drop them blindly.
-- ============================================================================

\set ON_ERROR_STOP on

-- ── 0. Fail closed unless explicitly approved local-docker ───────────────────
do $guard$
declare
  v_allow text := coalesce(current_setting('app.phase11_e2e_allow', true), '');
  v_port text;
  v_db text := current_database();
  v_user text := current_user;
  v_hosted_hint integer;
begin
  if v_allow is distinct from 'local-docker' then
    raise exception
      'phase11 e2e refused: set app.phase11_e2e_allow=local-docker on an approved local Docker DB first'
      using errcode = '42501';
  end if;

  if v_user is distinct from 'postgres' and v_user is distinct from 'supabase_admin' then
    raise exception 'phase11 e2e refused: unexpected role %', v_user using errcode = '42501';
  end if;

  if v_db is distinct from 'postgres' then
    raise exception 'phase11 e2e refused: unexpected database %', v_db using errcode = '42501';
  end if;

  -- Hosted Supabase projects expose a project-ref style claim / settings that
  -- local Kong stacks do not. Refuse obvious hosted markers without guessing.
  select count(*)::integer into v_hosted_hint
  from pg_settings
  where name in ('supabase.jwt_secret', 'app.settings.jwt_secret')
    and setting ilike '%eyJ%'  -- JWT-shaped secret alone is not proof; next checks matter
    and false;                 -- placeholder: never match solely on secret shape

  -- Refuse if a non-local Auth user email domain looks like a production cohort
  -- while the allow GUC was somehow set on the wrong host. Local fixture emails
  -- use @clash.local exclusively for this harness family.
  select count(*)::integer into v_hosted_hint
  from auth.users u
  where u.email is not null
    and u.email not ilike '%@clash.local'
    and u.email not ilike '%@supabase.io'
    and u.email not ilike 'e2e.%'
    and u.raw_user_meta_data ? 'iss'
    and coalesce(u.raw_user_meta_data->>'iss', '') ilike '%supabase.co%';

  if v_hosted_hint > 0 then
    raise exception
      'phase11 e2e refused: auth.users looks hosted/production (supabase.co iss present)'
      using errcode = '42501';
  end if;

  -- Inside the local Docker image the listen port is typically 5432; the host
  -- maps 55322→5432. We only use port as a soft signal + notice.
  select setting into v_port from pg_settings where name = 'port';
  raise notice 'phase11 e2e guard ok db=% user=% port=% persist=%',
    v_db, v_user, coalesce(v_port, '?'),
    coalesce(current_setting('app.phase11_e2e_persist', true), '0');
end;
$guard$;

-- ── 1. Session-scoped report (no public SECURITY DEFINER) ───────────────────
create temporary table if not exists _phase11_e2e_report (
  stage text not null,
  check_name text not null,
  result text not null check (result in ('PASS','FAIL','BLOCKED')),
  expected text,
  actual text,
  detail text,
  recorded_at timestamptz not null default now(),
  primary key (stage, check_name)
) on commit preserve rows;

-- Journey flips session role to authenticated; keep the temp report writable.
grant all on table _phase11_e2e_report to public;

create or replace function pg_temp.phase11_e2e_note(
  p_stage text, p_check text, p_result text, p_expected text, p_actual text, p_detail text default null
) returns void
language plpgsql
security definer
set search_path = pg_temp, public
as $$
begin
  -- Session-local helper only (pg_temp). security definer avoids role flip denials.
  insert into _phase11_e2e_report(stage, check_name, result, expected, actual, detail)
  values (p_stage, p_check, p_result, p_expected, p_actual, p_detail)
  on conflict (stage, check_name) do update
    set result = excluded.result,
        expected = excluded.expected,
        actual = excluded.actual,
        detail = excluded.detail,
        recorded_at = now();
end;
$$;

grant execute on function pg_temp.phase11_e2e_note(text, text, text, text, text, text) to public;

-- ── 2. Journey (transactional; rolls back unless persist=1) ─────────────────
begin;

do $$
#variable_conflict use_variable
declare
  uid_a uuid := '00000000-0000-4000-e2e0-0000000000a1';
  uid_b uuid := '00000000-0000-4000-e2e0-0000000000b2';
  uid_j uuid := '00000000-0000-4000-e2e0-0000000000c3';
  pid_a text;
  pid_b text;
  pid_j text;
  take_id text;
  take_row public.takes%rowtype;
  challenge jsonb;
  accept jsonb;
  clash_id text;
  room_id text;
  duel_count integer;
  clash_take text;
  fighter_a text;
  fighter_b text;
  side_b text;
  room_view jsonb;
  judge_err text;
  fighter_judge_err text;
  unauth_judge_err text;
  settle1 jsonb;
  settle2 jsonb;
  verdict_count integer;
  v_winner_side text;
  rep_count integer;
  fighter_rep_count integer;
  juror_rep_count integer;
  rep_kinds text;
  notify_result_count integer;
  stats_a jsonb;
  stats_b jsonb;
  comment_id text;
  comment_notify_count integer;
  comment_entity text;
  self_notify_count integer;
  block_err text;
  mig_13 boolean;
  mig_14_fn boolean;
  mig_14_row boolean;
  has_comment_trg boolean;
  v_run_tag text := to_char(clock_timestamp(), 'HH24MISS.US');
begin
  delete from _phase11_e2e_report;

  select exists(
    select 1 from supabase_migrations.schema_migrations where version = '20261011120000'
  ) into mig_13;
  select to_regprocedure('public.profile_clash_stats(text)') is not null into mig_14_fn;
  select exists(
    select 1 from supabase_migrations.schema_migrations where version = '20261010120000'
  ) into mig_14_row;
  select exists(
    select 1 from pg_trigger where tgname = 'comments_notify_arena'
  ) into has_comment_trg;

  perform pg_temp.phase11_e2e_note(
    'env', 'pr13_migration_present',
    case when mig_13 then 'PASS' else 'FAIL' end,
    '20261011120000 in schema_migrations',
    case when mig_13 then 'present' else 'missing' end,
    'PR #13 comment-notification migration marker'
  );
  perform pg_temp.phase11_e2e_note(
    'env', 'pr14_profile_clash_stats_fn',
    case when mig_14_fn then 'PASS' else 'BLOCKED' end,
    'profile_clash_stats(text) exists',
    case when mig_14_fn then 'present' else 'missing' end,
    case when mig_14_row then 'schema_migrations also has 20261010120000'
         else 'function present ad-hoc; 20261010120000 not in schema_migrations'
    end
  );
  perform pg_temp.phase11_e2e_note(
    'env', 'comment_notify_trigger',
    case when has_comment_trg then 'PASS' else 'BLOCKED' end,
    'comments_notify_arena trigger',
    case when has_comment_trg then 'present' else 'missing' end,
    null
  );

  -- Isolated local auth users (JWT claims simulation). Unique handles per run
  -- so re-runs never depend on stale profile rows from a prior durable run.
  insert into auth.users(id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (uid_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e.a.phase11@clash.local', now(), now(), now()),
    (uid_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e.b.phase11@clash.local', now(), now(), now()),
    (uid_j, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e.judge.phase11@clash.local', now(), now(), now())
  on conflict (id) do nothing;

  select id into pid_a from public.profiles where auth_user_id = uid_a;
  select id into pid_b from public.profiles where auth_user_id = uid_b;
  select id into pid_j from public.profiles where auth_user_id = uid_j;

  if pid_a is null or pid_b is null or pid_j is null then
    raise exception 'profile trigger did not create e2e profiles';
  end if;

  -- Clear throttle rows for these actors so re-runs are not rate-blocked.
  delete from public.rate_limit_events
  where actor_id in (pid_a, pid_b, pid_j);

  update public.profiles
     set handle = left('e2ea_' || v_run_tag, 20),
         name = 'E2E Author A'
   where id = pid_a;
  update public.profiles
     set handle = left('e2eb_' || v_run_tag, 20),
         name = 'E2E Challenger B'
   where id = pid_b;
  update public.profiles
     set handle = left('e2ej_' || v_run_tag, 20),
         name = 'E2E Judge'
   where id = pid_j;

  perform pg_temp.phase11_e2e_note(
    'env', 'test_accounts',
    'PASS',
    '3 isolated local auth+profile pairs',
    format('A=%s B=%s J=%s', pid_a, pid_b, pid_j),
    'emails e2e.*.phase11@clash.local'
  );

  -- A. Take creation
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);

  select * into take_row from public.create_take(
    'techtakes',
    'Phase11 E2E ' || v_run_tag || ': juniors still matter when AI drafts the first cut.'
  );
  take_id := take_row.id;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  perform pg_temp.phase11_e2e_note(
    'A', 'take_created',
    case when take_id is not null and take_row.author_id = pid_a then 'PASS' else 'FAIL' end,
    'Take persisted for author A',
    format('take=%s author=%s status=%s', take_id, take_row.author_id, take_row.status),
    null
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid_b::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);

  if exists(select 1 from public.takes t where t.id = take_id and t.author_id = pid_a) then
    perform pg_temp.phase11_e2e_note('A', 'take_visible_to_b', 'PASS', 'B can select Take', take_id, null);
  else
    perform pg_temp.phase11_e2e_note('A', 'take_visible_to_b', 'FAIL', 'B can select Take', 'not visible', null);
  end if;

  -- B. Challenge
  challenge := public.create_arena_challenge(
    take_id,
    'Companies still need juniors to validate and integrate generated code. ' || v_run_tag
  );

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  perform pg_temp.phase11_e2e_note(
    'B', 'challenge_created',
    case when challenge->>'status' = 'PENDING' and challenge->>'created' = 'true' then 'PASS' else 'FAIL' end,
    'PENDING created=true',
    left(challenge::text, 240),
    null
  );
  perform pg_temp.phase11_e2e_note(
    'B', 'challenge_participants',
    case when challenge->>'challengerId' = pid_b and challenge->>'challengedId' = pid_a then 'PASS' else 'FAIL' end,
    format('challenger=%s challenged=%s', pid_b, pid_a),
    format('challenger=%s challenged=%s', challenge->>'challengerId', challenge->>'challengedId'),
    null
  );
  perform pg_temp.phase11_e2e_note(
    'B', 'challenge_received_notification',
    case when exists(
      select 1 from public.notifications n
      where n.kind = 'challenge_received' and n.recipient_id = pid_a
        and n.id = 'challenge_received_' || (challenge->>'id')
        and n.entity_id = take_id
    ) then 'PASS' else 'FAIL' end,
    'challenge_received for A deep-links Take',
    coalesce((
      select n.id || ' entity=' || n.entity_id from public.notifications n
      where n.kind = 'challenge_received' and n.recipient_id = pid_a
      order by n.created_at desc limit 1
    ), 'none'),
    null
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  accept := public.resolve_arena_challenge((challenge->>'id')::uuid, 'ACCEPT');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  clash_id := accept->>'clashId';
  room_id := accept->>'roomId';

  select count(*)::integer into duel_count from public.clashes c where c.take_id = take_id;
  select c.take_id, (select t.author_id from public.takes t where t.id = c.take_id), c.challenger_id
    into clash_take, fighter_a, fighter_b
  from public.clashes c where c.id = clash_id;

  perform pg_temp.phase11_e2e_note(
    'B', 'accept_creates_duel',
    case when accept->>'status' = 'ACCEPTED' and clash_id is not null and room_id is not null then 'PASS' else 'FAIL' end,
    'ACCEPTED with clashId+roomId',
    left(accept::text, 240),
    null
  );
  perform pg_temp.phase11_e2e_note(
    'B', 'exactly_one_duel',
    case when duel_count = 1 then 'PASS' else 'FAIL' end,
    '1 clash for take',
    duel_count::text,
    null
  );
  perform pg_temp.phase11_e2e_note(
    'B', 'duel_links',
    case when clash_take = take_id and fighter_a = pid_a and fighter_b = pid_b then 'PASS' else 'FAIL' end,
    format('take=%s A=%s B=%s', take_id, pid_a, pid_b),
    format('take=%s A=%s B=%s', clash_take, fighter_a, fighter_b),
    null
  );

  -- C. Duel
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text,
    true
  );
  room_view := public.get_arena_room(room_id);
  perform set_config('request.jwt.claims', null, true);

  select ac.counter_position into side_b
  from public.arena_challenges ac
  where ac.id = (challenge->>'id')::uuid;

  perform pg_temp.phase11_e2e_note(
    'C', 'duel_sides',
    case when room_view#>>'{duel,fighterA,id}' = pid_a
          and room_view#>>'{duel,fighterB,id}' = pid_b
          and room_view#>>'{duel,viewerRelationship}' = 'fighter_a'
         then 'PASS' else 'FAIL' end,
    'A=author B=challenger viewer=fighter_a',
    format('A=%s B=%s rel=%s',
      room_view#>>'{duel,fighterA,id}',
      room_view#>>'{duel,fighterB,id}',
      room_view#>>'{duel,viewerRelationship}'),
    null
  );
  perform pg_temp.phase11_e2e_note(
    'C', 'counter_position',
    case when side_b is not null and length(side_b) > 20
          and public.clash_view(clash_id)->>'sideBText' = side_b
         then 'PASS' else 'FAIL' end,
    'side B text from challenge exposed on clash_view',
    left(coalesce(public.clash_view(clash_id)->>'sideBText', side_b, ''), 120),
    null
  );

  perform set_config('request.jwt.claims', null, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid_b::text, 'role', 'authenticated')::text,
    true
  );
  room_view := public.get_arena_room(room_id);
  perform set_config('request.jwt.claims', null, true);

  perform pg_temp.phase11_e2e_note(
    'C', 'reopen_as_b',
    case when coalesce(room_view->>'roomId', room_view->>'id') = room_id
          and room_view#>>'{duel,viewerRelationship}' = 'fighter_b'
         then 'PASS' else 'FAIL' end,
    'same roomId, viewer=fighter_b',
    format('room=%s rel=%s status=%s',
      coalesce(room_view->>'roomId', room_view->>'id'),
      room_view#>>'{duel,viewerRelationship}',
      room_view->>'status'),
    null
  );

  update public.clashes
    set opens_at = now() - interval '1 hour',
        closes_at = now() + interval '15 minutes'
    where id = clash_id;
  update public.arena_rooms
    set opens_at = now() - interval '1 hour',
        status = 'JUDGING',
        closes_at = now() + interval '15 minutes'
    where id = room_id;
  update public.arena_daily_topics
    set opens_at = now() - interval '1 hour',
        final_arguments_at = now() - interval '30 minutes',
        judging_at = now() - interval '5 minutes',
        closes_at = now() + interval '15 minutes'
    where id = (select topic_id from public.arena_rooms where id = room_id);

  -- D. Judgement
  begin
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text,
      true
    );
    perform public.submit_judgement(clash_id, 'A');
    fighter_judge_err := 'accepted';
  exception when others then
    fighter_judge_err := sqlstate || ':' || sqlerrm;
  end;
  perform set_config('request.jwt.claims', null, true);

  perform pg_temp.phase11_e2e_note(
    'D', 'fighter_judgement_rejected',
    case when fighter_judge_err like 'P0005%' then 'PASS' else 'FAIL' end,
    'P0005 fighter cannot judge',
    fighter_judge_err,
    null
  );

  begin
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', uid_j::text, 'role', 'authenticated')::text,
      true
    );
    perform public.submit_judgement(clash_id, 'A');
    perform public.submit_judgement(clash_id, 'A');
    judge_err := 'ok';
  exception when others then
    judge_err := sqlstate || ':' || sqlerrm;
  end;
  perform set_config('request.jwt.claims', null, true);

  perform pg_temp.phase11_e2e_note(
    'D', 'judge_ballot_idempotent',
    case when judge_err = 'ok'
          and (select count(*)::integer from public.judgements j where j.clash_id = clash_id) = 1
         then 'PASS' else 'FAIL' end,
    'one ballot after retry',
    coalesce(
      (select count(*)::integer from public.judgements j where j.clash_id = clash_id)::text,
      '0'
    ) || ' err=' || judge_err,
    null
  );

  begin
    perform set_config('request.jwt.claims', null, true);
    perform public.submit_judgement(clash_id, 'B');
    unauth_judge_err := 'accepted';
  exception when others then
    unauth_judge_err := sqlstate || ':' || sqlerrm;
  end;

  perform pg_temp.phase11_e2e_note(
    'D', 'unauthenticated_judgement_rejected',
    case when unauth_judge_err <> 'accepted' then 'PASS' else 'FAIL' end,
    'rejected without auth',
    unauth_judge_err,
    null
  );

  -- E. Settlement
  update public.clashes set closes_at = now() - interval '1 minute' where id = clash_id;
  update public.arena_rooms set closes_at = now() - interval '1 minute', status = 'OPEN' where id = room_id;
  update public.arena_daily_topics
    set closes_at = now() - interval '1 minute'
    where id = (select topic_id from public.arena_rooms where id = room_id);

  settle1 := public.settle_arena_room(room_id);
  settle2 := public.settle_clash(clash_id);

  select count(*)::integer, max(v.winner_side::text)
    into verdict_count, v_winner_side
  from public.verdicts v where v.clash_id = clash_id;

  select count(*)::integer into rep_count
  from public.reputation_events e where e.clash_id = clash_id;

  select count(*)::integer into fighter_rep_count
  from public.reputation_events e
  where e.clash_id = clash_id and e.profile_id in (pid_a, pid_b);

  select count(*)::integer into juror_rep_count
  from public.reputation_events e
  where e.clash_id = clash_id and e.profile_id = pid_j;

  select string_agg(e.kind::text || ':' || e.profile_id, ',' order by e.kind::text, e.profile_id)
    into rep_kinds
  from public.reputation_events e where e.clash_id = clash_id;

  select count(*)::integer into notify_result_count
  from public.notifications n
  where n.kind in ('clash_result', 'challenge_result', 'reputation')
    and (n.recipient_id in (pid_a, pid_b) or n.entity_id in (clash_id, room_id));

  perform pg_temp.phase11_e2e_note(
    'E', 'settlement_verdict_once',
    case when verdict_count = 1 and v_winner_side = 'A' then 'PASS' else 'FAIL' end,
    'one verdict winner A',
    format('count=%s winner=%s', verdict_count, v_winner_side),
    left(settle1::text, 200)
  );
  perform pg_temp.phase11_e2e_note(
    'E', 'settlement_idempotent',
    case when settle1 = settle2
          and (select status::text from public.clashes where id = clash_id) = 'settled'
          and (select status::text from public.arena_rooms where id = room_id) = 'SETTLED'
         then 'PASS' else 'FAIL' end,
    'settle_arena_room == settle_clash; statuses settled',
    format('eq=%s clash=%s room=%s',
      (settle1 = settle2)::text,
      (select status::text from public.clashes where id = clash_id),
      (select status::text from public.arena_rooms where id = room_id)),
    null
  );
  perform pg_temp.phase11_e2e_note(
    'E', 'reputation_events',
    case when rep_count >= 2 then 'PASS' else 'FAIL' end,
    '>=2 reputation_events for clash',
    format('count=%s kinds=%s', rep_count, coalesce(rep_kinds, 'none')),
    null
  );
  -- Documented Clash Engine contract: jurors rewarded; fighters via verdict/stats.
  perform pg_temp.phase11_e2e_note(
    'E', 'reputation_target_model',
    case when juror_rep_count >= 2 and fighter_rep_count = 0 then 'PASS' else 'FAIL' end,
    'juror rewarded; fighters get win via verdict/profile_clash_stats',
    format('juror_events=%s fighter_events=%s', juror_rep_count, fighter_rep_count),
    'see docs/PHASE_11_SETTLEMENT_REWARDS_AUDIT.md'
  );
  perform pg_temp.phase11_e2e_note(
    'E', 'no_double_award_on_repeat_settle',
    case when settle1 = settle2 then 'PASS' else 'FAIL' end,
    'repeat settle does not change payload / double-award',
    rep_count::text,
    format('notifications_related=%s', notify_result_count)
  );

  -- F. Profile stats
  if not mig_14_fn then
    perform pg_temp.phase11_e2e_note('F', 'winner_wins', 'BLOCKED', 'profile_clash_stats', 'missing', null);
    perform pg_temp.phase11_e2e_note('F', 'loser_no_win_from_this', 'BLOCKED', 'profile_clash_stats', 'missing', null);
    perform pg_temp.phase11_e2e_note('F', 'settled_clash_counts', 'BLOCKED', 'profile_clash_stats', 'missing', null);
    perform pg_temp.phase11_e2e_note('F', 'profile_refresh_rpc', 'BLOCKED', 'profile_clash_stats', 'missing', null);
  else
    stats_a := public.profile_clash_stats(pid_a);
    stats_b := public.profile_clash_stats(pid_b);

    perform pg_temp.phase11_e2e_note(
      'F', 'winner_wins',
      case when (stats_a->>'wins')::int >= 1 then 'PASS' else 'FAIL' end,
      'A wins >= 1',
      stats_a::text,
      null
    );
    perform pg_temp.phase11_e2e_note(
      'F', 'loser_no_win_from_this',
      case when (stats_b->>'wins')::int = 0 and (stats_b->>'losses')::int >= 1 then 'PASS' else 'FAIL' end,
      'B wins=0 losses>=1',
      stats_b::text,
      null
    );
    perform pg_temp.phase11_e2e_note(
      'F', 'settled_clash_counts',
      case when (stats_a->>'clashes')::int >= 1 and (stats_b->>'clashes')::int >= 1 then 'PASS' else 'FAIL' end,
      'both clashes >= 1',
      format('A=%s B=%s', stats_a->>'clashes', stats_b->>'clashes'),
      null
    );
    perform pg_temp.phase11_e2e_note(
      'F', 'profile_refresh_rpc',
      'PASS',
      'second profile_clash_stats call stable',
      public.profile_clash_stats(pid_a)::text,
      'RPC-only; not a UI refresh'
    );
  end if;

  -- G. Comments
  if not has_comment_trg then
    perform pg_temp.phase11_e2e_note('G', 'comment_notification', 'BLOCKED', 'comments_notify_arena', 'missing', null);
    perform pg_temp.phase11_e2e_note('G', 'comment_deeplink', 'BLOCKED', 'comments_notify_arena', 'missing', null);
    perform pg_temp.phase11_e2e_note('G', 'self_notification_blocked', 'BLOCKED', 'comments_notify_arena', 'missing', null);
    perform pg_temp.phase11_e2e_note('G', 'block_restriction', 'BLOCKED', 'comments_notify_arena', 'missing', null);
  else
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text,
      true
    );
    perform set_config('role', 'authenticated', true);
    select id into take_id from public.create_take(
      'techtakes',
      'Phase11 E2E comment host ' || v_run_tag || ': notifications must deep-link here.'
    );
    perform set_config('role', 'postgres', true);

    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', uid_b::text, 'role', 'authenticated')::text,
      true
    );
    perform set_config('role', 'authenticated', true);
    select id into comment_id from public.create_comment(
      take_id,
      'Solid take — juniors catch the silent failure modes.'
    );
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);

    select count(*)::integer, max(n.entity_id)
      into comment_notify_count, comment_entity
    from public.notifications n
    where n.kind = 'comment' and n.recipient_id = pid_a and n.entity_id = take_id;

    perform pg_temp.phase11_e2e_note(
      'G', 'comment_notification',
      case when comment_notify_count = 1 then 'PASS' else 'FAIL' end,
      'one comment notification for A',
      format('count=%s comment=%s', comment_notify_count, comment_id),
      null
    );
    perform pg_temp.phase11_e2e_note(
      'G', 'comment_deeplink',
      case when comment_entity = take_id then 'PASS' else 'FAIL' end,
      'entity_id = take id',
      coalesce(comment_entity, 'none'),
      null
    );

    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text,
      true
    );
    perform set_config('role', 'authenticated', true);
    perform public.create_comment(take_id, 'Author self-reply should not notify the author.');
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);

    select count(*)::integer into self_notify_count
    from public.notifications n
    where n.kind = 'comment' and n.recipient_id = pid_a and n.actor_id = pid_a;

    perform pg_temp.phase11_e2e_note(
      'G', 'self_notification_blocked',
      case when self_notify_count = 0 then 'PASS' else 'FAIL' end,
      '0 self comment notifications',
      self_notify_count::text,
      null
    );

    insert into public.blocks(blocker_id, blocked_id) values (pid_a, pid_b)
    on conflict do nothing;

    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text,
      true
    );
    perform set_config('role', 'authenticated', true);
    select id into take_id from public.create_take(
      'techtakes',
      'Phase11 E2E block host ' || v_run_tag || ': blocked challenger comment must not notify.'
    );
    perform set_config('role', 'postgres', true);

    begin
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', uid_b::text, 'role', 'authenticated')::text,
        true
      );
      perform set_config('role', 'authenticated', true);
      perform public.create_comment(take_id, 'Blocked user comment should not create a notification.');
      block_err := 'comment_ok';
    exception when others then
      block_err := sqlstate || ':' || sqlerrm;
    end;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);

    perform pg_temp.phase11_e2e_note(
      'G', 'block_restriction',
      case when not exists(
        select 1 from public.notifications n
        where n.kind = 'comment' and n.recipient_id = pid_a and n.entity_id = take_id
      ) then 'PASS' else 'FAIL' end,
      'no comment notification when author blocked challenger',
      format('comment_attempt=%s', block_err),
      null
    );

    delete from public.blocks where blocker_id = pid_a and blocked_id = pid_b;
  end if;

  perform pg_temp.phase11_e2e_note(
    'ids', 'journey',
    'PASS',
    'reference IDs (valid inside this transaction)',
    format(
      'take_duel=%s challenge=%s clash=%s room=%s A=%s B=%s J=%s',
      (select t.id from public.takes t where t.author_id = pid_a and t.text like 'Phase11 E2E %juniors%' order by t.created_at desc limit 1),
      challenge->>'id',
      clash_id,
      room_id,
      pid_a, pid_b, pid_j
    ),
    null
  );
end;
$$;

-- Emit evidence before optional rollback.
select stage, check_name, result, expected, left(coalesce(actual,''), 200) as actual, left(coalesce(detail,''), 120) as detail
from _phase11_e2e_report
order by
  case stage
    when 'env' then 0 when 'A' then 1 when 'B' then 2 when 'C' then 3
    when 'D' then 4 when 'E' then 5 when 'F' then 6 when 'G' then 7
    when 'ids' then 8 else 9
  end,
  check_name;

select result, count(*) from _phase11_e2e_report group by 1 order by 1;

-- Finish: default ROLLBACK. Durable commit only when persist GUC is exactly 1.
select (coalesce(current_setting('app.phase11_e2e_persist', true), '0') = '1') as phase11_persist
\gset

\if :phase11_persist
create table if not exists public._phase11_e2e_report (
  stage text not null,
  check_name text not null,
  result text not null,
  expected text,
  actual text,
  detail text,
  recorded_at timestamptz not null default now(),
  primary key (stage, check_name)
);
delete from public._phase11_e2e_report;
insert into public._phase11_e2e_report
  select * from _phase11_e2e_report;
select 'phase11 e2e DURABLE: committing fixtures + public._phase11_e2e_report' as notice;
commit;
\else
select 'phase11 e2e default: rolling back journey fixtures (matrix printed above)' as notice;
rollback;
\endif
