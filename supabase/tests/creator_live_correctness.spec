# PostgreSQL isolationtester input. NOT EXECUTED in LIVE-CONNECT-B2.
# Separate owner connection plus actual authenticated host/viewer connections.
# Use only an explicitly authorized disposable database; setup commits fixtures
# for cross-connection visibility, teardown deletes only this fixture namespace.
# Refuse collisions. No automatic target selection or fallback is provided.
setup
{
  SET statement_timeout='10s'; SET lock_timeout='8s';
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id LIKE 'b2iso-%')
       OR EXISTS (SELECT 1 FROM auth.users WHERE id IN
         ('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002'))
    THEN RAISE EXCEPTION 'fixture collision'; END IF;
  END $$;
  CREATE TEMP TABLE b3_live_fixture_owner(ok boolean);
  INSERT INTO b3_live_fixture_owner VALUES(true);
  INSERT INTO auth.users(id) VALUES
    ('72000000-0000-0000-0000-000000000001'),('72000000-0000-0000-0000-000000000002');
  UPDATE public.profiles SET id='b2iso-host',handle='b2iso_host',name='Fictional B2 Host',role='creator'
    WHERE auth_user_id='72000000-0000-0000-0000-000000000001';
  UPDATE public.profiles SET id='b2iso-viewer',handle='b2iso_viewer',name='Fictional B2 Viewer',role='viewer'
    WHERE auth_user_id='72000000-0000-0000-0000-000000000002';
  INSERT INTO public.creator_vaults(id,creator_id,title,status)
    VALUES('b2iso-vault','b2iso-host','Fictional isolation vault','active');
  INSERT INTO public.creator_live_sessions(id,creator_id,vault_id,title,status,access,started_at)
    VALUES('b2iso-session','b2iso-host','b2iso-vault','Fictional retained session','LIVE','FREE',now());
  INSERT INTO public.creator_live_interactions(id,session_id,creator_id,type,prompt,options,status)
    VALUES('b2iso-round','b2iso-session','b2iso-host','CHOICE','Fictional choice',
      jsonb_build_array(jsonb_build_object('id','a','label','A'),jsonb_build_object('id','b','label','B')),'OPEN');
  INSERT INTO public.creator_live_continuation_approvals(session_id,profile_id,capability,evidence_ref,expires_at)
    VALUES('b2iso-session','b2iso-host','HOST','isolation fixture evidence',clock_timestamp()+interval '1 hour'),
      ('b2iso-session','b2iso-viewer','VIEWER','isolation fixture evidence',clock_timestamp()+interval '1 hour');
  INSERT INTO public.vault_subscriptions(id,subscriber_id,vault_id,status,current_period_end)
    VALUES('b2iso-sub','b2iso-viewer','b2iso-vault','active',clock_timestamp()+interval '1 hour');
}
teardown
{
  DO $$ BEGIN
    IF to_regclass('pg_temp.b3_live_fixture_owner') IS NULL
    THEN RAISE EXCEPTION 'refuse teardown without successful fixture ownership'; END IF;
  END $$;
  DELETE FROM public.creator_live_sessions WHERE id='b2iso-session';
  DELETE FROM public.creator_vaults WHERE id='b2iso-vault';
  DELETE FROM public.rate_limit_events WHERE actor_id IN ('b2iso-host','b2iso-viewer');
  DELETE FROM public.profiles WHERE id IN ('b2iso-host','b2iso-viewer');
  DELETE FROM auth.users WHERE id IN
    ('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002');
  DROP TABLE pg_temp.b3_live_fixture_owner;
}

session "host"
setup { SET application_name='cl-b3-host'; SET ROLE authenticated; SELECT set_config('request.jwt.claims',jsonb_build_object('sub','72000000-0000-0000-0000-000000000001','role','authenticated')::text,false); SET statement_timeout='10s'; SET lock_timeout='8s'; }
step "h_begin" { BEGIN; }
step "h_lock" { SELECT public.start_creator_live_session('b2iso-session'); }
step "h_open" { SELECT public.create_creator_live_interaction('b2iso-session','CHOICE','Fictional new round',jsonb_build_array(jsonb_build_object('id','a','label','A'),jsonb_build_object('id','b','label','B'))); }
step "h_end" { SELECT public.end_creator_live_session('b2iso-session'); }
step "h_close" { SELECT public.close_creator_live_interaction('b2iso-round'); }
step "h_commit" { COMMIT; }

session "viewer"
setup { SET application_name='cl-b3-viewer'; SET ROLE authenticated; SELECT set_config('request.jwt.claims',jsonb_build_object('sub','72000000-0000-0000-0000-000000000002','role','authenticated')::text,false); SET statement_timeout='10s'; SET lock_timeout='8s'; }
step "v_begin" { BEGIN; }
step "v_vote" { SELECT public.submit_creator_live_vote('b2iso-round','a'); }
step "v_deadline" {
  DO $$ BEGIN
    IF clock_timestamp() >= (SELECT closes_at FROM public.creator_live_interactions WHERE id='b2iso-round')
    THEN RAISE EXCEPTION 'invalid timing: request did not begin before deadline'; END IF;
    PERFORM public.submit_creator_live_vote('b2iso-round','a');
    RAISE EXCEPTION 'late vote unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL; END $$;
}
step "v_commit" { COMMIT; }
step "v_approval_denied" {
  DO $$ BEGIN
    PERFORM public.submit_creator_live_vote('b2iso-round','a');
    RAISE EXCEPTION 'unapproved vote unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE 'P0006' THEN NULL; END $$;
}
step "v_subscription_denied" {
  DO $$ BEGIN
    PERFORM public.submit_creator_live_vote('b2iso-round','a');
    RAISE EXCEPTION 'expired subscriber vote unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'not permitted to take part' THEN RAISE; END IF;
  END $$;
}

session "other_host"
setup { SET application_name='cl-b3-other-host'; SET ROLE authenticated; SELECT set_config('request.jwt.claims',jsonb_build_object('sub','72000000-0000-0000-0000-000000000001','role','authenticated')::text,false); SET statement_timeout='10s'; SET lock_timeout='8s'; }
step "o_end" { SELECT public.end_creator_live_session('b2iso-session'); }
step "o_open_denied" {
  DO $$ BEGIN
    PERFORM public.create_creator_live_interaction('b2iso-session','CHOICE','After end',jsonb_build_array(jsonb_build_object('id','a','label','A'),jsonb_build_object('id','b','label','B')));
    RAISE EXCEPTION 'post-end open unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL; END $$;
}

session "other_viewer"
setup { SET application_name='cl-b3-other-viewer'; SET ROLE authenticated; SELECT set_config('request.jwt.claims',jsonb_build_object('sub','72000000-0000-0000-0000-000000000002','role','authenticated')::text,false); SET statement_timeout='10s'; SET lock_timeout='8s'; }
step "w_begin" { BEGIN; }
step "w_vote" { SELECT public.submit_creator_live_vote('b2iso-round','a'); }
step "w_commit" { COMMIT; }

session "revoker"
setup { SET application_name='cl-b3-revoker'; SET statement_timeout='10s'; SET lock_timeout='8s'; }
step "r_begin" { BEGIN; }
step "r_revoke" {
  SELECT id FROM public.creator_live_sessions WHERE id='b2iso-session' FOR UPDATE;
  UPDATE public.creator_live_continuation_approvals SET revoked_at=clock_timestamp()
    WHERE session_id='b2iso-session' AND profile_id='b2iso-viewer';
}
step "r_commit" { COMMIT; }

session "observer"
setup { SET application_name='cl-b3-observer'; SET statement_timeout='10s'; SET lock_timeout='8s'; }
step "o_begin" { BEGIN; }
step "o_commit" { COMMIT; }
step "o_approval_expiry" {
  UPDATE public.creator_live_continuation_approvals SET expires_at=clock_timestamp()+interval '3 seconds'
    WHERE session_id='b2iso-session' AND profile_id='b2iso-viewer';
}
step "o_sub_arm" {
  UPDATE public.creator_live_sessions SET access='SUBSCRIBER' WHERE id='b2iso-session';
  UPDATE public.vault_subscriptions SET current_period_end=clock_timestamp()+interval '3 seconds'
    WHERE id='b2iso-sub';
}
step "o_arm_long" { UPDATE public.creator_live_interactions SET closes_at=clock_timestamp()+interval '3 seconds' WHERE id='b2iso-round'; }
step "o_rate_lock" {
  SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('b2iso-viewer'||chr(31)||'creator_live_vote',0));
}
step "o_sleep" { SELECT pg_sleep(4); }
step "o_wait_viewer" {
  DO $$ DECLARE v_pid integer; BEGIN
    PERFORM pg_stat_clear_snapshot();
    SELECT pid INTO STRICT v_pid FROM pg_stat_activity WHERE application_name='cl-b3-viewer';
    IF NOT EXISTS(SELECT 1 FROM pg_stat_activity b WHERE b.pid=ANY(pg_blocking_pids(v_pid))
      AND b.application_name IN ('cl-b3-observer','cl-b3-revoker','cl-b3-host','cl-b3-other-viewer'))
    THEN RAISE EXCEPTION 'expected real viewer lock wait was not observed'; END IF;
    IF clock_timestamp() >= least(
      (SELECT expires_at FROM public.creator_live_continuation_approvals WHERE session_id='b2iso-session' AND profile_id='b2iso-viewer'),
      (SELECT current_period_end FROM public.vault_subscriptions WHERE id='b2iso-sub'),
      (SELECT closes_at FROM public.creator_live_interactions WHERE id='b2iso-round'))
    THEN RAISE EXCEPTION 'invalid timing: wait was not observed before expiry'; END IF;
  END $$;
}
step "o_wait_revoker" {
  DO $$ DECLARE v_pid integer; r_pid integer; BEGIN
    PERFORM pg_stat_clear_snapshot();
    SELECT pid INTO STRICT v_pid FROM pg_stat_activity WHERE application_name='cl-b3-viewer';
    SELECT pid INTO STRICT r_pid FROM pg_stat_activity WHERE application_name='cl-b3-revoker';
    IF NOT (v_pid=ANY(pg_blocking_pids(r_pid))) THEN RAISE EXCEPTION 'revoker did not wait for authorized vote'; END IF;
  END $$;
}
step "o_arm" { UPDATE public.creator_live_interactions SET closes_at=clock_timestamp()+interval '1 second' WHERE id='b2iso-round'; }
step "o_wait" { SELECT pg_sleep(2); }
step "o_verify_end" {
  DO $$ BEGIN
    IF (SELECT status FROM public.creator_live_sessions WHERE id='b2iso-session') <> 'ENDED'
      OR EXISTS(SELECT 1 FROM public.creator_live_interactions WHERE session_id='b2iso-session' AND status='OPEN')
    THEN RAISE EXCEPTION 'end/open serialization failed'; END IF;
  END $$;
}
step "o_verify_vote" {
  DO $$ BEGIN
    IF (SELECT count(*) FROM public.creator_live_votes WHERE interaction_id='b2iso-round') <> 1
      OR (SELECT total_votes FROM public.creator_live_interactions WHERE id='b2iso-round') <> 1
    THEN RAISE EXCEPTION 'vote/close or duplicate vote inconsistent'; END IF;
  END $$;
}
step "o_verify_deadline" {
  DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM public.creator_live_votes WHERE interaction_id='b2iso-round')
    THEN RAISE EXCEPTION 'late ballot persisted'; END IF;
  END $$;
}
step "o_verify_denied" {
  DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM public.creator_live_votes WHERE interaction_id='b2iso-round')
      OR EXISTS(SELECT 1 FROM public.creator_live_events WHERE session_id='b2iso-session')
      OR EXISTS(SELECT 1 FROM public.creator_live_viewers WHERE session_id='b2iso-session')
      OR EXISTS(SELECT 1 FROM public.rate_limit_events WHERE actor_id='b2iso-viewer' AND action='creator_live_vote')
      OR (SELECT total_votes FROM public.creator_live_interactions WHERE id='b2iso-round') <> 0
    THEN RAISE EXCEPTION 'denied request left partial authoritative effects'; END IF;
  END $$;
}

# End must wait for the opener's parent lock and then close its new interaction.
permutation "h_begin" "h_open" "o_end" "h_commit" "o_verify_end"
permutation "h_begin" "h_end" "o_open_denied" "h_commit" "o_verify_end"
# Vote locks session first; close must wait and include its committed ballot.
permutation "v_begin" "v_vote" "h_begin" "h_close" "v_commit" "h_commit" "o_verify_vote"
permutation "v_begin" "v_vote" "w_begin" "w_vote" "v_commit" "w_commit" "o_verify_vote"
# Request starts before deadline, waits on session, then must reject wall-clock lateness.
permutation "o_arm" "h_begin" "h_lock" "v_begin" "v_deadline" "o_wait" "h_commit" "v_commit" "o_verify_deadline"
# Approval lock wait: scan began before expiry, post-lock validation must deny.
permutation "o_begin" "o_approval_expiry" "v_begin" "v_approval_denied" "o_wait_viewer" "o_sleep" "o_commit" "v_commit" "o_verify_denied"
# Revocation owns parent first: vote waits, then cannot return an aggregate.
permutation "r_begin" "r_revoke" "v_begin" "v_approval_denied" "o_wait_viewer" "r_commit" "v_commit" "o_verify_denied"
# Authorized vote owns parent first: revoker waits; one ballot is valid, later replay denied.
permutation "v_begin" "v_vote" "r_begin" "r_revoke" "o_wait_revoker" "v_commit" "r_commit" "v_approval_denied" "o_verify_vote"
# Expired subscription must use current wall time, not transaction-start now().
permutation "o_sub_arm" "h_begin" "h_lock" "v_begin" "v_subscription_denied" "o_wait_viewer" "o_sleep" "h_commit" "v_commit" "o_verify_denied"
# Use the ACTUAL installed rate-limiter advisory key, not a synthetic row lock.
permutation "o_arm_long" "o_begin" "o_rate_lock" "v_begin" "v_deadline" "o_wait_viewer" "o_sleep" "o_commit" "v_commit" "o_verify_denied"
