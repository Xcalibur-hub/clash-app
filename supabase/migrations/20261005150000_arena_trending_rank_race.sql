-- ============================================================================
-- CLASH 2.0 · Phase 4.1 — Trending Battles as a LIVE RANKING RACE
-- ----------------------------------------------------------------------------
-- Evolves list_arena_trending_battles:
--   · Current Top 10 = recency-weighted attention (not latest bucket alone)
--   · series.v = historical RANK at each bucket (1 = top), not raw attention
--   · rankDelta = places gained vs ~1 hour ago (null / NEW when unknown)
-- Reuses arena_trend_snapshots + arena_attention_score unchanged.
-- ============================================================================

-- Recency weight for a snapshot age in minutes (mirrors utils/arenaTrendRank.ts).
create or replace function public.arena_trend_recency_weight(p_age_minutes numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_age_minutes is null or p_age_minutes < 0 then 0::numeric
    when p_age_minutes <= 30 then 1.00
    when p_age_minutes <= 60 then 0.65
    when p_age_minutes <= 180 then 0.30
    when p_age_minutes <= 360 then 0.10
    else 0::numeric
  end;
$$;

revoke execute on function public.arena_trend_recency_weight(numeric) from public, anon;
grant execute on function public.arena_trend_recency_weight(numeric) to authenticated, service_role;

create or replace function public.list_arena_trending_battles(
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 10));
  v_now timestamptz := now();
begin
  return coalesce(
    (
      with snaps as (
        -- Bound history: last 6 hours of snapshots (graph window).
        select
          s.topic_id,
          s.bucket_at,
          s.attention_score,
          s.unique_actors,
          s.participant_count,
          s.active_room_count,
          extract(epoch from (v_now - s.bucket_at)) / 60.0 as age_minutes
          from public.arena_trend_snapshots s
          join public.arena_daily_topics t on t.id = s.topic_id
         where s.bucket_at >= v_now - interval '6 hours'
           and s.attention_score > 0
           and t.status in ('live', 'closed')
      ),
      weighted as (
        select
          topic_id,
          sum(attention_score * public.arena_trend_recency_weight(age_minutes))::numeric as weighted_score,
          max(unique_actors) filter (where age_minutes <= 30) as recent_actors,
          (array_agg(participant_count order by bucket_at desc))[1] as participant_count,
          (array_agg(active_room_count order by bucket_at desc))[1] as active_room_count,
          (array_agg(attention_score order by bucket_at desc))[1] as latest_attention
          from snaps
         group by topic_id
        having sum(attention_score * public.arena_trend_recency_weight(age_minutes)) > 0
      ),
      current_ranked as (
        select
          w.*,
          t.title,
          t.hood,
          t.status::text as topic_status,
          row_number() over (
            order by w.weighted_score desc, coalesce(w.recent_actors, 0) desc, w.topic_id asc
          )::integer as rank
          from weighted w
          join public.arena_daily_topics t on t.id = w.topic_id
      ),
      top as (
        select * from current_ranked where rank <= v_limit
      ),
      -- Per-bucket ranking across ALL scored topics (for historical race paths).
      bucket_ranks as (
        select
          sn.topic_id,
          sn.bucket_at,
          row_number() over (
            partition by sn.bucket_at
            order by sn.attention_score desc, sn.unique_actors desc, sn.topic_id asc
          )::integer as hist_rank
          from snaps sn
      ),
      -- ~1 hour ago comparison bucket (closest bucket_at ≤ now-50m within window).
      hour_ago as (
        select max(bucket_at) as bucket_at
          from snaps
         where bucket_at <= v_now - interval '50 minutes'
      ),
      hour_ranks as (
        select br.topic_id, br.hist_rank
          from bucket_ranks br
          join hour_ago h on h.bucket_at is not null and br.bucket_at = h.bucket_at
      ),
      windows as (
        select
          tp.topic_id,
          coalesce(sum(s.attention_score) filter (
            where s.bucket_at > v_now - interval '30 minutes'
          ), 0)::integer as recent_score,
          coalesce(sum(s.attention_score) filter (
            where s.bucket_at > v_now - interval '60 minutes'
              and s.bucket_at <= v_now - interval '30 minutes'
          ), 0)::integer as prior_score,
          coalesce(sum(s.unique_actors) filter (
            where s.bucket_at > v_now - interval '30 minutes'
          ), 0)::integer as recent_sample
          from top tp
          left join public.arena_trend_snapshots s
            on s.topic_id = tp.topic_id
           and s.bucket_at >= v_now - interval '6 hours'
         group by tp.topic_id
      ),
      -- Rank series for the race chart: only points where the topic had activity.
      rank_series as (
        select
          tp.topic_id,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                't', (extract(epoch from br.bucket_at) * 1000)::bigint,
                'v', br.hist_rank
              )
              order by br.bucket_at asc
            ),
            '[]'::jsonb
          ) as points,
          count(br.bucket_at)::integer as history_points
          from top tp
          left join bucket_ranks br on br.topic_id = tp.topic_id
         group by tp.topic_id
      ),
      rooms as (
        select
          tp.topic_id,
          (
            select r.id
              from public.arena_rooms r
             where r.topic_id = tp.topic_id
               and r.status in ('OPEN', 'FINAL_ARGUMENTS', 'JUDGING')
             order by r.participant_count desc, r.created_at asc
             limit 1
          ) as hot_room_id
          from top tp
      )
      select jsonb_agg(
        jsonb_build_object(
          'rank', tp.rank,
          'topicId', tp.topic_id,
          'title', tp.title,
          'hood', tp.hood,
          'attentionScore', tp.latest_attention,
          'weightedScore', round(tp.weighted_score, 2),
          'momentum', public.arena_trend_momentum(w.recent_score, w.prior_score, w.recent_sample),
          -- Places gained: positive = rose (old_rank - new_rank). null = insufficient.
          -- Special: when no hour-ago rank but we have current → treat as NEW via rankDeltaKind.
          'rankDelta', case
            when hr.hist_rank is null and rs.history_points < 2 then null
            when hr.hist_rank is null then null
            else (hr.hist_rank - tp.rank)
          end,
          'rankDeltaKind', case
            when hr.hist_rank is null and rs.history_points >= 1 then 'NEW'
            when hr.hist_rank is null then 'INSUFFICIENT'
            when hr.hist_rank = tp.rank then 'FLAT'
            when hr.hist_rank > tp.rank then 'UP'
            else 'DOWN'
          end,
          'changePercent', case
            when w.recent_sample < 5 or w.prior_score < 8 then null
            else round(((w.recent_score - w.prior_score)::numeric
              / greatest(w.prior_score, 1)::numeric) * 100)::integer
          end,
          'topicStatus', tp.topic_status,
          'participantCount', coalesce(tp.participant_count, 0),
          'activeRoomCount', coalesce(tp.active_room_count, 0),
          'hotRoomId', rm.hot_room_id,
          'series', coalesce(rs.points, '[]'::jsonb),
          'historyReady', rs.history_points >= 2
        )
        order by tp.rank asc
      )
      from top tp
      join windows w on w.topic_id = tp.topic_id
      join rank_series rs on rs.topic_id = tp.topic_id
      join rooms rm on rm.topic_id = tp.topic_id
      left join hour_ranks hr on hr.topic_id = tp.topic_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.list_arena_trending_battles(integer) from public;
grant execute on function public.list_arena_trending_battles(integer) to anon, authenticated;

comment on function public.list_arena_trending_battles(integer) is
  'Live Top-10 ranking race. series.v is historical rank (1=top). Recency-weighted. No stance.';
