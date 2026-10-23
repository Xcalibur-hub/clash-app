-- E3.4.3: repair explicit managed anon grants, including already-applied
-- lifecycle histories. Editing an older migration cannot repair its live ACLs.
-- Keep authenticated/service_role grants, owner execution, bodies and RLS intact.
begin;

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

commit;
