-- ============================================================================
-- Phase 4.1 — Ranking race (pgTAP)
-- ============================================================================
begin;
select no_plan();

reset role;
select set_config('request.jwt.claims', null, true);

select has_function('public', 'arena_trend_recency_weight', 'recency weight exists');
select is(public.arena_trend_recency_weight(10), 1.00, '0–30m weight');
select is(public.arena_trend_recency_weight(45), 0.65, '30–60m weight');
select is(public.arena_trend_recency_weight(120), 0.30, '1–3h weight');
select is(public.arena_trend_recency_weight(240), 0.10, '3–6h weight');
select is(public.arena_trend_recency_weight(400), 0::numeric, 'beyond 6h is zero');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f101'),
  ('00000000-0000-0000-0000-00000000f102'),
  ('00000000-0000-0000-0000-00000000f103');

update public.profiles set id = 'rr-a', handle = 'rr_a', name = 'Race A'
 where auth_user_id = '00000000-0000-0000-0000-00000000f101';
update public.profiles set id = 'rr-b', handle = 'rr_b', name = 'Race B'
 where auth_user_id = '00000000-0000-0000-0000-00000000f102';
update public.profiles set id = 'rr-c', handle = 'rr_c', name = 'Race C'
 where auth_user_id = '00000000-0000-0000-0000-00000000f103';

insert into public.arena_daily_topics
  (id, title, hood, status, opens_at, final_arguments_at, judging_at, closes_at)
values
  ('rr-ai', 'Will AI replace junior developers?', 'movies', 'live',
   now() - interval '4 hours', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours'),
  ('rr-pixel', 'iPhone vs Pixel camera', 'movies', 'live',
   now() - interval '4 hours', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours'),
  ('rr-college', 'Is college still worth it?', 'movies', 'live',
   now() - interval '4 hours', now() + interval '2 hours', now() + interval '3 hours', now() + interval '4 hours');

-- Historical buckets: AI starts #1, Pixel overtakes.
insert into public.arena_trend_snapshots
  (topic_id, bucket_at, attention_score, unique_actors, message_authors, reaction_actors,
   evidence_authors, join_actors, participant_count, active_room_count)
values
  ('rr-ai',      now() - interval '120 minutes', 50, 8, 4, 4, 0, 2, 20, 1),
  ('rr-pixel',   now() - interval '120 minutes', 20, 3, 2, 1, 0, 1, 8, 1),
  ('rr-college', now() - interval '120 minutes', 30, 5, 3, 2, 0, 1, 12, 1),
  ('rr-ai',      now() - interval '60 minutes',  25, 5, 2, 3, 0, 1, 18, 1),
  ('rr-pixel',   now() - interval '60 minutes',  40, 7, 3, 4, 0, 2, 22, 1),
  ('rr-college', now() - interval '60 minutes',  35, 6, 3, 3, 0, 1, 16, 1),
  ('rr-ai',      now() - interval '10 minutes',  15, 3, 1, 2, 0, 1, 14, 1),
  ('rr-pixel',   now() - interval '10 minutes',  55, 9, 4, 5, 0, 2, 28, 1),
  ('rr-college', now() - interval '10 minutes',  40, 6, 3, 3, 0, 1, 19, 1);

select ok(
  jsonb_array_length(public.list_arena_trending_battles(10)) = 3,
  'three live topics appear in the race'
);

select is(
  (public.list_arena_trending_battles(10) -> 0 ->> 'topicId'),
  'rr-pixel',
  'recency-weighted rank 1 is the overtaking Pixel battle'
);

select ok(
  (public.list_arena_trending_battles(10) -> 0 -> 'series') @>
    '[{"v": 3}]'::jsonb
  or (public.list_arena_trending_battles(10) -> 0 -> 'series' -> 0 ->> 'v') is not null,
  'series carries historical ranks (v is rank)'
);

select ok(
  (public.list_arena_trending_battles(10) -> 0 ->> 'historyReady')::boolean = true,
  'historyReady when multiple buckets exist'
);

-- series.v values should be ranks 1..10, never raw attention scores like 55.
select ok(
  (
    select bool_and((point ->> 'v')::integer between 1 and 10)
      from jsonb_array_elements(public.list_arena_trending_battles(10) -> 0 -> 'series') point
  ),
  'series.v is a rank between 1 and 10'
);

select ok(
  jsonb_array_length(public.list_arena_trending_battles(10)) <= 10,
  'never exceeds top 10'
);

-- No stance keys in the payload.
select ok(
  not (public.list_arena_trending_battles(10) -> 0 ? 'stance')
  and not (public.list_arena_trending_battles(10) -> 0 ? 'viewerStance'),
  'ranking race never leaks stance'
);

select * from finish();
rollback;
