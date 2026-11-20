-- ============================================================================
-- CLASH cloud wrapper — step 110 of 119
-- version           : 20261023130000
-- ledger name       : meet_rpc_permission_hardening
-- mode              : direct
-- executed source   : supabase/migrations/20261023130000_meet_rpc_permission_hardening.sql
-- executed sha256   : 2f6d391cd4f033ff4909102e420287c068092578ef5eb26995bf9b5a3930b1bc
-- normalisation     : strip-begin-commit
-- normalized sha256 : 4d1b1d5d3889137b29aaed4b367924feaa58ae790526cb28bb7c78c85dc34cc5
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
--
-- CONCURRENCY (Round 8): the ledger insert has NO conflict clause. If a row for
-- this version already exists, the insert raises unique_violation, the whole
-- transaction aborts and no statement of the migration survives. An
-- 'on conflict do nothing' would have skipped the row while re-executing the
-- migration body - the one case the read-back could not detect.
-- ============================================================================
begin;

-- E3.4.3: repair explicit managed anon grants, including already-applied
-- lifecycle histories. Editing an older migration cannot repair its live ACLs.
-- Keep authenticated/service_role grants, owner execution, bodies and RLS intact.

-- Five legacy client RPCs.
revoke execute on function
  public.ack_meet_video_safety(),
  public.get_meet_ice_servers(),
  public.has_meet_video_safety_ack(),
  public.leave_meet_queue(),
  public.next_meet(text, public.meet_match_mode, text, public.hood_id, text[], public.meet_channel)
from public, anon;

-- Twelve lifecycle client RPCs: historical versions revoked only PUBLIC.
revoke execute on function
  public.block_meet_peer(text),
  public.get_meet_session(text),
  public.join_meet_queue(public.meet_match_mode, text, public.hood_id, text[], public.meet_channel),
  public.leave_meet_session(text, text),
  public.list_meet_messages(text, integer, timestamptz),
  public.list_meet_signals(text, timestamptz),
  public.poll_meet_queue(),
  public.publish_meet_signal(text, public.meet_signal_kind, jsonb),
  public.report_meet_message(text, text, public.report_reason, text),
  public.report_meet_session(text, public.report_reason, text),
  public.send_meet_message(text, text),
  public.touch_meet_session(text)
from public, anon;



insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261023130000',
  'meet_rpc_permission_hardening',
  array['sha256:4d1b1d5d3889137b29aaed4b367924feaa58ae790526cb28bb7c78c85dc34cc5'],
  'clash-cloud-wrapper-v1'
);

commit;
