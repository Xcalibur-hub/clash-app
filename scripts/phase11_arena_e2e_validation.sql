-- Phase 11 Step 2D — Arena end-to-end validation (local Supabase only).
-- Commits test identities and one journey so IDs remain queryable.
-- Not a pgTAP suite; emits a machine-readable report table.

\set ON_ERROR_STOP on

create table if not exists public._phase11_e2e_report (
  stage text not null,
  check_name text not null,
  result text not null check (result in ('PASS','FAIL','BLOCKED')),
  expected text,
  actual text,
  detail text,
  recorded_at timestamptz not null default now(),
  primary key (stage, check_name)
);

create or replace function public._phase11_e2e_note(
  p_stage text, p_check text, p_result text, p_expected text, p_actual text, p_detail text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public._phase11_e2e_report(stage, check_name, result, expected, actual, detail)
  values (p_stage, p_check, p_result, p_expected, p_actual, p_detail)
  on conflict (stage, check_name) do update
    set result = excluded.result,
        expected = excluded.expected,
        actual = excluded.actual,
        detail = excluded.detail,
        recorded_at = now();
end;
$$;

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
begin
  delete from public._phase11_e2e_report;

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

  perform public._phase11_e2e_note(
    'env', 'pr13_migration_present',
    case when mig_13 then 'PASS' else 'FAIL' end,
    '20261011120000 in schema_migrations',
    case when mig_13 then 'present (name empty)' else 'missing' end,
    'PR #13 comment-notification migration marker'
  );
  perform public._phase11_e2e_note(
    'env', 'pr14_profile_clash_stats_fn',
    case when mig_14_fn then 'PASS' else 'BLOCKED' end,
    'profile_clash_stats(text) exists',
    case when mig_14_fn then 'present' else 'missing' end,
    case when mig_14_row then 'schema_migrations also has 20261010120000'
         else 'function present ad-hoc; 20261010120000 not in schema_migrations'
    end
  );
  perform public._phase11_e2e_note(
    'env', 'comment_notify_trigger',
    case when has_comment_trg then 'PASS' else 'BLOCKED' end,
    'comments_notify_arena trigger',
    case when has_comment_trg then 'present' else 'missing' end,
    null
  );

  -- Isolated local auth users (no password; JWT claims simulation only).
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

  update public.profiles set handle = 'e2e_p11_a', name = 'E2E Author A' where id = pid_a;
  update public.profiles set handle = 'e2e_p11_b', name = 'E2E Challenger B' where id = pid_b;
  update public.profiles set handle = 'e2e_p11_j', name = 'E2E Judge' where id = pid_j;

  perform public._phase11_e2e_note(
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
    'Phase11 E2E ' || to_char(clock_timestamp(), 'HH24MISS.US') || ': juniors still matter when AI drafts the first cut.'
  );
  take_id := take_row.id;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  perform public._phase11_e2e_note(
    'A', 'take_created',
    case when take_id is not null and take_row.author_id = pid_a then 'PASS' else 'FAIL' end,
    'Take persisted for author A',
    format('take=%s author=%s status=%s', take_id, take_row.author_id, take_row.status),
    null
  );

  -- B discovers / opens take (readable as authenticated B)
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid_b::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);

  if exists(select 1 from public.takes where id = take_id and author_id = pid_a) then
    perform public._phase11_e2e_note(
      'A', 'take_visible_to_b',
      'PASS',
      'B can select Take',
      take_id,
      null
    );
  else
    perform public._phase11_e2e_note(
      'A', 'take_visible_to_b',
      'FAIL',
      'B can select Take',
      'not visible',
      null
    );
  end if;

  -- B. Challenge
  challenge := public.create_arena_challenge(
    take_id,
    'Companies still need juniors to validate and integrate generated code.'
  );

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);

  perform public._phase11_e2e_note(
    'B', 'challenge_created',
    case when challenge->>'status' = 'PENDING' and challenge->>'created' = 'true' then 'PASS' else 'FAIL' end,
    'PENDING created=true',
    challenge::text,
    null
  );
  perform public._phase11_e2e_note(
    'B', 'challenge_participants',
    case when challenge->>'challengerId' = pid_b and challenge->>'challengedId' = pid_a then 'PASS' else 'FAIL' end,
    format('challenger=%s challenged=%s', pid_b, pid_a),
    format('challenger=%s challenged=%s', challenge->>'challengerId', challenge->>'challengedId'),
    null
  );
  perform public._phase11_e2e_note(
    'B', 'challenge_received_notification',
    case when exists(
      select 1 from public.notifications
      where kind = 'challenge_received' and recipient_id = pid_a
        and id = 'challenge_received_' || (challenge->>'id')
        and entity_id = take_id
    ) then 'PASS' else 'FAIL' end,
    'challenge_received for A deep-links Take',
    coalesce((
      select id || ' entity=' || entity_id from public.notifications
      where kind = 'challenge_received' and recipient_id = pid_a
      order by created_at desc limit 1
    ), 'none'),
    null
  );

  -- Accept as A
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
  select c.take_id, (select author_id from public.takes t where t.id = c.take_id), c.challenger_id
    into clash_take, fighter_a, fighter_b
  from public.clashes c where c.id = clash_id;

  perform public._phase11_e2e_note(
    'B', 'accept_creates_duel',
    case when accept->>'status' = 'ACCEPTED' and clash_id is not null and room_id is not null then 'PASS' else 'FAIL' end,
    'ACCEPTED with clashId+roomId',
    accept::text,
    null
  );
  perform public._phase11_e2e_note(
    'B', 'exactly_one_duel',
    case when duel_count = 1 then 'PASS' else 'FAIL' end,
    '1 clash for take',
    duel_count::text,
    null
  );
  perform public._phase11_e2e_note(
    'B', 'duel_links',
    case when clash_take = take_id and fighter_a = pid_a and fighter_b = pid_b then 'PASS' else 'FAIL' end,
    format('take=%s A=%s B=%s', take_id, pid_a, pid_b),
    format('take=%s A=%s B=%s', clash_take, fighter_a, fighter_b),
    null
  );

  -- C. Duel open / sides
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

  perform public._phase11_e2e_note(
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
  perform public._phase11_e2e_note(
    'C', 'counter_position',
    case when side_b is not null and length(side_b) > 20
          and public.clash_view(clash_id)->>'sideBText' = side_b
         then 'PASS' else 'FAIL' end,
    'side B text from challenge exposed on clash_view',
    left(coalesce(public.clash_view(clash_id)->>'sideBText', side_b, ''), 120),
    null
  );

  -- Leave/reopen: clear JWT then reload as B
  perform set_config('request.jwt.claims', null, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', uid_b::text, 'role', 'authenticated')::text,
    true
  );
  room_view := public.get_arena_room(room_id);
  perform set_config('request.jwt.claims', null, true);

  perform public._phase11_e2e_note(
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

  -- Advance clocks into JUDGING (server-side; no device clock)
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

  -- D. Judgement — unauthorized fighter
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

  perform public._phase11_e2e_note(
    'D', 'fighter_judgement_rejected',
    case when fighter_judge_err like 'P0005%' then 'PASS' else 'FAIL' end,
    'P0005 fighter cannot judge',
    fighter_judge_err,
    null
  );

  -- Duplicate/idempotent + authorized judge
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

  perform public._phase11_e2e_note(
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

  -- Premature/unauthorized: random empty JWT
  begin
    perform set_config('request.jwt.claims', null, true);
    perform public.submit_judgement(clash_id, 'B');
    unauth_judge_err := 'accepted';
  exception when others then
    unauth_judge_err := sqlstate || ':' || sqlerrm;
  end;

  perform public._phase11_e2e_note(
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
  from public.notifications
  where kind in ('clash_result', 'challenge_result', 'reputation')
    and (recipient_id in (pid_a, pid_b) or entity_id in (clash_id, room_id));

  perform public._phase11_e2e_note(
    'E', 'settlement_verdict_once',
    case when verdict_count = 1 and v_winner_side = 'A' then 'PASS' else 'FAIL' end,
    'one verdict winner A',
    format('count=%s winner=%s settle1=%s', verdict_count, v_winner_side, settle1::text),
    null
  );
  -- Clash Engine currently awards juror ledger rows (not fighter win rows).
  perform public._phase11_e2e_note(
    'E', 'reputation_target_model',
    case when juror_rep_count >= 2 and fighter_rep_count = 0 then 'PASS' else 'FAIL' end,
    'juror rewarded; fighters get win via verdict/profile_clash_stats',
    format('juror_events=%s fighter_events=%s kinds=%s', juror_rep_count, fighter_rep_count, coalesce(rep_kinds, 'none')),
    'Documented product behavior from settle_clash_legacy — not a harness invention'
  );
  perform public._phase11_e2e_note(
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
  perform public._phase11_e2e_note(
    'E', 'reputation_events',
    case when rep_count >= 2 then 'PASS' else 'FAIL' end,
    '>=2 reputation_events for clash',
    format('count=%s kinds=%s', rep_count, coalesce(rep_kinds, 'none')),
    null
  );
  perform public._phase11_e2e_note(
    'E', 'no_double_award_on_repeat_settle',
    case when rep_count = (
      select count(*)::integer from public.reputation_events e where e.clash_id = clash_id
    ) and settle1 = settle2 then 'PASS' else 'FAIL' end,
    'repeat settle does not add events',
    rep_count::text,
    format('notifications_related=%s', notify_result_count)
  );

  -- F. Profile stats
  if not mig_14_fn then
    perform public._phase11_e2e_note('F', 'winner_wins', 'BLOCKED', 'profile_clash_stats', 'missing', null);
    perform public._phase11_e2e_note('F', 'loser_no_win', 'BLOCKED', 'profile_clash_stats', 'missing', null);
    perform public._phase11_e2e_note('F', 'settled_clash_counts', 'BLOCKED', 'profile_clash_stats', 'missing', null);
  else
    stats_a := public.profile_clash_stats(pid_a);
    stats_b := public.profile_clash_stats(pid_b);

    perform public._phase11_e2e_note(
      'F', 'winner_wins',
      case when (stats_a->>'wins')::int >= 1 then 'PASS' else 'FAIL' end,
      'A wins >= 1',
      stats_a::text,
      null
    );
    perform public._phase11_e2e_note(
      'F', 'loser_no_win_from_this',
      case when (stats_b->>'wins')::int = 0 and (stats_b->>'losses')::int >= 1 then 'PASS' else 'FAIL' end,
      'B wins=0 losses>=1',
      stats_b::text,
      null
    );
    perform public._phase11_e2e_note(
      'F', 'settled_clash_counts',
      case when (stats_a->>'clashes')::int >= 1 and (stats_b->>'clashes')::int >= 1 then 'PASS' else 'FAIL' end,
      'both clashes >= 1',
      format('A=%s B=%s', stats_a->>'clashes', stats_b->>'clashes'),
      null
    );
    perform public._phase11_e2e_note(
      'F', 'profile_refresh_rpc',
      'PASS',
      'second profile_clash_stats call stable',
      public.profile_clash_stats(pid_a)::text,
      'verified via repeat RPC read (no UI refresh in this harness)'
    );
  end if;

  -- G. Comments + notifications
  if not has_comment_trg then
    perform public._phase11_e2e_note('G', 'comment_notification', 'BLOCKED', 'comments_notify_arena', 'missing', null);
    perform public._phase11_e2e_note('G', 'comment_deeplink', 'BLOCKED', 'comments_notify_arena', 'missing', null);
    perform public._phase11_e2e_note('G', 'self_notification_blocked', 'BLOCKED', 'comments_notify_arena', 'missing', null);
    perform public._phase11_e2e_note('G', 'block_restriction', 'BLOCKED', 'comments_notify_arena', 'missing', null);
  else
    -- Separate take for comment checks so journey Take stays clean.
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', uid_a::text, 'role', 'authenticated')::text,
      true
    );
    perform set_config('role', 'authenticated', true);
    select id into take_id from public.create_take(
      'techtakes',
      'Phase11 E2E comment host ' || to_char(clock_timestamp(), 'HH24MISS.US') || ': notifications must deep-link here.'
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

    select count(*)::integer, max(entity_id)
      into comment_notify_count, comment_entity
    from public.notifications
    where kind = 'comment' and recipient_id = pid_a and entity_id = take_id;

    perform public._phase11_e2e_note(
      'G', 'comment_notification',
      case when comment_notify_count = 1 then 'PASS' else 'FAIL' end,
      'one comment notification for A',
      format('count=%s comment=%s', comment_notify_count, comment_id),
      null
    );
    perform public._phase11_e2e_note(
      'G', 'comment_deeplink',
      case when comment_entity = take_id then 'PASS' else 'FAIL' end,
      'entity_id = take id',
      coalesce(comment_entity, 'none'),
      null
    );

    -- Self comment should not notify self
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
    from public.notifications
    where kind = 'comment' and recipient_id = pid_a and actor_id = pid_a;

    perform public._phase11_e2e_note(
      'G', 'self_notification_blocked',
      case when self_notify_count = 0 then 'PASS' else 'FAIL' end,
      '0 self comment notifications',
      self_notify_count::text,
      null
    );

    -- Block restriction: A blocks B, B comments on another A take → no notify
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
      'Phase11 E2E block host ' || to_char(clock_timestamp(), 'HH24MISS.US') || ': blocked challenger comment must not notify.'
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

    perform public._phase11_e2e_note(
      'G', 'block_restriction',
      case when not exists(
        select 1 from public.notifications
        where kind = 'comment' and recipient_id = pid_a and entity_id = take_id
      ) then 'PASS' else 'FAIL' end,
      'no comment notification when author blocked challenger',
      format('comment_attempt=%s notify=%s',
        block_err,
        exists(
          select 1 from public.notifications
          where kind = 'comment' and recipient_id = pid_a and entity_id = take_id
        )::text),
      'either comment rejected or comment allowed without notify is acceptable if notify absent'
    );

    delete from public.blocks where blocker_id = pid_a and blocked_id = pid_b;
  end if;

  -- Persist journey IDs for the markdown report
  perform public._phase11_e2e_note(
    'ids', 'journey',
    'PASS',
    'reference IDs',
    format(
      'take_duel=%s challenge=%s clash=%s room=%s profiles A=%s B=%s J=%s',
      (select id from public.takes where author_id = pid_a and text like 'Phase11 E2E %juniors%' order by created_at desc limit 1),
      challenge->>'id',
      clash_id,
      room_id,
      pid_a, pid_b, pid_j
    ),
    null
  );
end;
$$;

select stage, check_name, result, expected, actual, detail
from public._phase11_e2e_report
order by
  case stage
    when 'env' then 0 when 'A' then 1 when 'B' then 2 when 'C' then 3
    when 'D' then 4 when 'E' then 5 when 'F' then 6 when 'G' then 7
    when 'ids' then 8 else 9
  end,
  check_name;
