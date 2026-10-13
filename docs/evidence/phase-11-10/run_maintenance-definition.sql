CREATE OR REPLACE FUNCTION public.run_maintenance(p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_clashes integer;
  v_takes   integer;
  v_media   jsonb;
  v_rates   integer;
  v_drops   integer;
  v_subs    integer;
  v_preds   integer;
  v_world   integer;
  v_arena   integer;
  v_signals integer;
  v_backups integer;
  v_moments integer;
  v_trends  jsonb := '{}'::jsonb;
  v_latest  timestamptz;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('arena-maintenance-batch',0)) then
    return jsonb_build_object('skipped',true,'reason','maintenance_in_progress'); end if;
  perform set_config('clash.maintenance_failures','0',true);
  delete from public.arena_maintenance_failures where last_failed_at<clock_timestamp()-interval '7 days';
  update public.arena_maintenance_failures f set retry_status='resolved',resolved_at=clock_timestamp()
    where f.retry_status='pending' and ((f.operation='clash_settlement' and exists(select 1 from public.clashes c where c.id=f.item_id and c.status in('settled','cancelled')))
      or (f.operation='room_transition' and exists(select 1 from public.arena_rooms r where r.id=f.item_id and r.status in('SETTLED','CANCELLED'))));
  select public.settle_due_clashes(p_limit) into v_clashes;
  select public.expire_stale_takes(p_limit) into v_takes;
  select public.cleanup_stale_media(least(p_limit, 100)) into v_media;
  select public.cleanup_rate_limits(interval '7 days') into v_rates;
  select public.expire_vault_drops(p_limit) into v_drops;
  select public.expire_vault_subscriptions(p_limit) into v_subs;
  select public.close_prediction_games(p_limit) into v_preds;
  select public.expire_world_drops(p_limit) into v_world;
  select public.transition_due_arena_rooms(p_limit) into v_arena;
  select public.cleanup_meet_signals(p_limit) into v_signals;
  select public.expire_arena_backup_invites(least(p_limit, 200)) into v_backups;
  select public.award_arena_fun_moments(least(p_limit, 100)) into v_moments;

  select max(bucket_at) into v_latest from public.arena_trend_snapshots;
  if v_latest is null or v_latest <= now() - interval '9 minutes' then
    v_trends := public.refresh_arena_trend_snapshots(10, 36);
  else
    v_trends := jsonb_build_object('skipped', true, 'latestBucket', v_latest);
  end if;

  update public.arena_maintenance_failures f set retry_status='resolved',resolved_at=clock_timestamp()
    where f.retry_status='pending' and ((f.operation='clash_settlement' and exists(select 1 from public.clashes c where c.id=f.item_id and c.status in('settled','cancelled')))
      or (f.operation='room_transition' and exists(select 1 from public.arena_rooms r where r.id=f.item_id and r.status in('SETTLED','CANCELLED'))));
  return jsonb_build_object(
    'clashes_settled', v_clashes,
    'maintenance_item_failures', coalesce(nullif(current_setting('clash.maintenance_failures',true),''),'0')::integer,
    'partial_failure', coalesce(nullif(current_setting('clash.maintenance_failures',true),''),'0')::integer>0,
    'pending_retry_items', (select count(*) from public.arena_maintenance_failures where retry_status='pending'),
    'takes_expired', v_takes,
    'media', v_media,
    'rate_limits_pruned', v_rates,
    'vault_drops_expired', v_drops,
    'vault_subscriptions_expired', v_subs,
    'prediction_games_closed', v_preds,
    'world_drops_expired', v_world,
    'arena_rooms_transitioned', v_arena,
    'meet_signals_pruned', v_signals,
    'arena_backup_invites_expired', v_backups,
    'arena_fun_moments_awarded', v_moments,
    'arena_trends', v_trends
  );
end;
$function$

