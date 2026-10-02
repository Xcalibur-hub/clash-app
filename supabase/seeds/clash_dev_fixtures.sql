-- ============================================================================
-- CLASH · Development Clash fixtures (LOCAL ONLY)
-- ----------------------------------------------------------------------------
-- Synthetic profiles + Takes + Clashes so a real signed-in developer can:
--   other user's Take → reply → CLASH → Standard/Blind → judge.
-- Plus a live and a settled Live Daily Arena topic (`devfx_arena_*`) so the
-- Arena card, the stance gate, the room and the verdict all have real data.
--
-- SAFETY
--   · Not a migration — never applied by `supabase db push` / hosted deploy.
--   · Wired only into local `[db.seed]` (after seed.sql) and
--     `npm run supabase:seed:clash-dev` (localhost Docker container only).
--   · Does not weaken RLS, own-Take Clash rules, or auth checks.
--   · Idempotent: deletes the `devfx_*` namespace, then re-inserts.
--
-- See supabase/CLASH_DEV_FIXTURES.md for how to run / reset.
-- ============================================================================

begin;

-- Soft local guard: refuse when connected through a non-loopback address.
-- (Hosted SQL editors typically are not 127.0.0.1 / ::1 from the server side;
--  the npm runner also refuses any non-local Docker target.)
do $$
declare
  v_addr inet := inet_server_addr();
begin
  if v_addr is not null
     and host(v_addr) not in ('127.0.0.1', '::1')
     and host(v_addr) not like '172.%'   -- Docker bridge (local CLI containers)
     and host(v_addr) not like '10.%'
  then
    raise exception
      'clash_dev_fixtures: refused — server address % is not a local/dev network',
      v_addr;
  end if;
end $$;

-- ── Wipe previous fixture namespace (idempotent) ─────────────────────────────
-- Order respects FKs; LIKE scopes only this seed.
delete from public.notifications where entity_id like 'devfx_%';
delete from public.reputation_events
 where clash_id like 'devfx_%' or id like 'devfx_%' or arena_room_id like 'devfx_%';
delete from public.verdicts where clash_id like 'devfx_%';
delete from public.judgements where clash_id like 'devfx_%';
delete from public.clashes where id like 'devfx_%';
delete from public.comment_upvotes where comment_id like 'devfx_%';
delete from public.comments where id like 'devfx_%';
delete from public.takes where id like 'devfx_%';

-- Live Arena (Phase 13). Leaf rows first so no FK is ever left dangling, even
-- though topics/rooms cascade — the explicit order is the documentation.
delete from public.arena_room_argument_votes where room_id like 'devfx_arena_%';
delete from public.arena_room_side_votes     where room_id like 'devfx_arena_%';
delete from public.arena_room_message_reactions
 where message_id in (select id from public.arena_room_messages where room_id like 'devfx_arena_%');
delete from public.arena_room_evidence_marks
 where evidence_id in (select id from public.arena_room_evidence where room_id like 'devfx_arena_%');
delete from public.arena_room_results        where room_id like 'devfx_arena_%';
delete from public.arena_room_evidence       where room_id like 'devfx_arena_%';
delete from public.arena_room_messages       where room_id like 'devfx_arena_%';
delete from public.arena_room_participants   where room_id like 'devfx_arena_%';
delete from public.arena_rooms               where id like 'devfx_arena_%';
delete from public.arena_daily_topics        where id like 'devfx_arena_%';

delete from public.profiles where id like 'devfx_%';

-- ── Profiles (no auth_user_id — cannot be signed into; safe other-users) ─────
insert into public.profiles
  (id, handle, name, avatar_tint, bio, home_hood, role, moderated_hoods,
   reputation, coins, streak, rank)
values
  ('devfx_clash_test', 'clash_test', 'Clash Test', '#A580FF',
   'Synthetic Take author for local multi-user Clash testing. Do not use in production.',
   'techtakes', 'viewer', '{}', 4200, 800, 3, 'Hot Take'),
  ('devfx_challenger', 'dev_challenger', 'Dev Challenger', '#3D8BFF',
   'Synthetic Side B for pre-seeded open/settled Clashes.',
   'techtakes', 'viewer', '{}', 2100, 400, 2, 'Instigator'),
  ('devfx_juror_a', 'dev_juror_a', 'Dev Juror A', '#43D6A0',
   'Synthetic juror for settled Clash ballots.',
   'techtakes', 'viewer', '{}', 900, 120, 1, 'Rookie'),
  ('devfx_juror_b', 'dev_juror_b', 'Dev Juror B', '#FF6A3D',
   'Synthetic juror for settled Clash ballots.',
   'techtakes', 'viewer', '{}', 1100, 150, 1, 'Rookie'),
  ('devfx_arguer', 'dev_arguer', 'Dev Arguer', '#FFC861',
   'Synthetic commenter for argument-card UI.',
   'campushustle', 'viewer', '{}', 600, 80, 1, 'Rookie'),
  ('devfx_arena_u1', 'dev_arena_maya', 'Dev Maya', '#7CC7FF',
   'Synthetic Live Arena debater.',
   'techtakes', 'viewer', '{}', 1500, 220, 2, 'Instigator'),
  ('devfx_arena_u2', 'dev_arena_rohit', 'Dev Rohit', '#F2A0C8',
   'Synthetic Live Arena debater.',
   'techtakes', 'viewer', '{}', 800, 100, 1, 'Rookie'),
  ('devfx_arena_u3', 'dev_arena_sana', 'Dev Sana', '#9BE6C1',
   'Synthetic Live Arena debater.',
   'startups', 'viewer', '{}', 2600, 310, 4, 'Hot Take');

-- ── Takes owned by @clash_test ──────────────────────────────────────────────
-- Fresh takes: no Clash yet — your real account replies → CLASH → Standard/Blind.
-- Open/settled takes: pre-built Clashes your real account can open and judge.
insert into public.takes
  (id, author_id, hood, text, media_url, media_kind, media_caption, media_colors,
   media_duration, created_at, expires_at, status, clashes_count, reactions_count)
values
  ('devfx_take_fresh_a', 'devfx_clash_test', 'techtakes',
   'iPhone camera culture is peaking. Computational photography already won.',
   null, null, null, null, null,
   now() - interval '40 minutes', now() + interval '23 hours', 'active', 0, 42),

  ('devfx_take_fresh_b', 'devfx_clash_test', 'techtakes',
   'Foldables are the only phone form that still feels like the future.',
   'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&h=1000&fit=crop',
   'image', 'Square product shot', '{#292524,#57534E}', null,
   now() - interval '25 minutes', now() + interval '23 hours 20 minutes', 'active', 0, 28),

  ('devfx_take_open_std', 'devfx_clash_test', 'techtakes',
   'Android flagships have officially caught up with iPhone.',
   null, null, null, null, null,
   now() - interval '2 hours', now() + interval '22 hours', 'active', 1, 88),

  ('devfx_take_open_blind', 'devfx_clash_test', 'campushustle',
   'Campus placements still matter more than side projects — for most people.',
   'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&h=900&fit=crop',
   'image', 'Landscape campus dusk', '{#0C4A6E,#082F49}', null,
   now() - interval '90 minutes', now() + interval '22 hours 30 minutes', 'active', 1, 55),

  ('devfx_take_settled', 'devfx_clash_test', 'techtakes',
   'Paying for cloud photo storage is a tax on owning a phone.',
   null, null, null, null, null,
   now() - interval '20 hours', now() + interval '3 hours', 'active', 1, 120);

-- ── Comments / arguments ────────────────────────────────────────────────────
insert into public.comments
  (id, take_id, author_id, text, upvotes_count, is_pinned, created_at)
values
  -- Fresh takes: starter replies (your account should still add its own to CLASH)
  ('devfx_c_fresh_a1', 'devfx_take_fresh_a', 'devfx_arguer',
   'Sensors matter, but software pipelines decide what people actually post.', 14, false,
   now() - interval '30 minutes'),
  ('devfx_c_fresh_a2', 'devfx_take_fresh_a', 'devfx_challenger',
   'If computational photography won, why do people still chase glass branding?', 9, false,
   now() - interval '20 minutes'),
  ('devfx_c_fresh_b1', 'devfx_take_fresh_b', 'devfx_arguer',
   'Cool demos. Everyday pockets still reject the hinge.', 11, false,
   now() - interval '15 minutes'),

  -- Open Standard Clash: Side B argument (challenger comment)
  ('devfx_c_open_std', 'devfx_take_open_std', 'devfx_challenger',
   'Caught up on specs, still behind on software polish and resale.', 41, true,
   now() - interval '90 minutes'),
  ('devfx_c_open_std_arg', 'devfx_take_open_std', 'devfx_arguer',
   'Trade-in numbers disagree — mid-range Androids hold better than they used to.', 17, false,
   now() - interval '70 minutes'),

  -- Open Blind Clash
  ('devfx_c_open_blind', 'devfx_take_open_blind', 'devfx_challenger',
   'Side projects get interviews. Placements get your parents off your back.', 33, true,
   now() - interval '60 minutes'),
  ('devfx_c_open_blind_arg', 'devfx_take_open_blind', 'devfx_arguer',
   'Both matter — but the first offer still leans on the brand on your resume.', 12, false,
   now() - interval '45 minutes'),

  -- Settled Clash
  ('devfx_c_settled', 'devfx_take_settled', 'devfx_challenger',
   'Local storage plus a cheap SSD beats a forever subscription.', 52, true,
   now() - interval '18 hours'),
  ('devfx_c_settled_arg', 'devfx_take_settled', 'devfx_arguer',
   'Until you lose the laptop. Sync is the product people actually buy.', 19, false,
   now() - interval '17 hours');

-- ── OPEN Standard Clash (judgeable by your real account) ────────────────────
insert into public.clashes
  (id, take_id, challenger_id, challenger_comment_id, status, mode, opens_at, closes_at)
values
  ('devfx_clash_open_std', 'devfx_take_open_std', 'devfx_challenger', 'devfx_c_open_std',
   'open', 'STANDARD', now() - interval '80 minutes', now() + interval '22 hours');

-- ── OPEN Blind Clash ────────────────────────────────────────────────────────
insert into public.clashes
  (id, take_id, challenger_id, challenger_comment_id, status, mode, opens_at, closes_at)
values
  ('devfx_clash_open_blind', 'devfx_take_open_blind', 'devfx_challenger', 'devfx_c_open_blind',
   'open', 'BLIND', now() - interval '50 minutes', now() + interval '22 hours');

-- ── SETTLED Clash (direct verdict — no settle_clash side effects) ───────────
-- Inserting a settled row + judgements + verdict keeps UI realistic without
-- writing global reputation_events / notifications that break pgTAP counters.
insert into public.clashes
  (id, take_id, challenger_id, challenger_comment_id, status, mode,
   opens_at, closes_at, settled_at)
values
  ('devfx_clash_settled', 'devfx_take_settled', 'devfx_challenger', 'devfx_c_settled',
   'settled', 'STANDARD',
   now() - interval '19 hours', now() - interval '10 minutes', now() - interval '9 minutes');

insert into public.judgements (clash_id, juror_id, side, created_at) values
  ('devfx_clash_settled', 'devfx_juror_a', 'A', now() - interval '30 minutes'),
  ('devfx_clash_settled', 'devfx_juror_b', 'A', now() - interval '25 minutes'),
  ('devfx_clash_settled', 'devfx_arguer',  'B', now() - interval '20 minutes');

insert into public.verdicts
  (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
values
  ('devfx_clash_settled', 'A', 2, 1, 3, 0.6667, 1, 'SPLIT DECISION');

-- ============================================================================
-- LIVE DAILY ARENA (Phase 13) — `devfx_arena_*`
-- ----------------------------------------------------------------------------
-- Two topics so both halves of the UI are reachable from a cold local DB:
--
--   devfx_arena_topic_live     live now, one OPEN room with 6 debaters, a thread,
--                              two citations and reactions. Your real account
--                              joins through the app; join_arena_topic picks the
--                              oldest non-full OPEN room, which is this one.
--   devfx_arena_topic_settled  already closed, with a SETTLED room + result so the
--                              verdict / best argument / Mindshift UI has data.
--
-- The settled room's THREAD is members-only (that is the RLS rule, not a bug),
-- so a non-member sees the public result and an explanatory note instead of the
-- transcript. No reputation_events are written: settlement pays reputation, and
-- a seed must not move a real profile's ledger or the pgTAP counters.
-- ============================================================================

insert into public.arena_daily_topics
  (id, title, description, hood, status, opens_at, final_arguments_at, judging_at, closes_at, created_at)
values
  ('devfx_arena_topic_live',
   'AI will replace most software developers within 10 years.',
   'Not "assist". Replace. Argue the decade, not the demo.',
   'techtakes', 'live',
   now() - interval '2 hours',
   now() + interval '2 hours',
   now() + interval '3 hours',
   now() + interval '4 hours',
   now() - interval '2 hours'),

  ('devfx_arena_topic_settled',
   'Remote-first startups ship slower than in-person ones.',
   'Settled yesterday — kept around so the verdict UI has something real to render.',
   'startups', 'closed',
   now() - interval '28 hours',
   now() - interval '8 hours',
   now() - interval '6 hours',
   now() - interval '4 hours',
   now() - interval '28 hours');

-- ── OPEN room (6 debaters, mixed stances, capacity 40) ──────────────────────
insert into public.arena_rooms
  (id, topic_id, status, capacity, participant_count, opens_at, closes_at, created_at)
values
  ('devfx_arena_room_open', 'devfx_arena_topic_live', 'OPEN', 40, 6,
   now() - interval '2 hours', now() + interval '4 hours', now() - interval '2 hours');

-- A stance is private forever: these rows exist so the room has real people in
-- it, and no RPC ever reports how they split.
insert into public.arena_room_participants
  (room_id, topic_id, profile_id, initial_stance, role, joined_at)
values
  ('devfx_arena_room_open', 'devfx_arena_topic_live', 'devfx_clash_test', 'AGREE',    'debater', now() - interval '115 minutes'),
  ('devfx_arena_room_open', 'devfx_arena_topic_live', 'devfx_challenger', 'DISAGREE', 'debater', now() - interval '110 minutes'),
  ('devfx_arena_room_open', 'devfx_arena_topic_live', 'devfx_juror_a',    'AGREE',    'debater', now() - interval '100 minutes'),
  ('devfx_arena_room_open', 'devfx_arena_topic_live', 'devfx_juror_b',    'DISAGREE', 'debater', now() - interval '95 minutes'),
  ('devfx_arena_room_open', 'devfx_arena_topic_live', 'devfx_arguer',     'UNSURE',   'debater', now() - interval '80 minutes'),
  ('devfx_arena_room_open', 'devfx_arena_topic_live', 'devfx_arena_u1',   'AGREE',    'debater', now() - interval '70 minutes');

insert into public.arena_room_messages
  (id, room_id, author_id, kind, body, parent_message_id, created_at)
values
  ('devfx_arena_m1', 'devfx_arena_room_open', 'devfx_clash_test', 'text',
   'Autocomplete became a junior engineer in three years. Extrapolating that curve ten years out is not a wild claim, it is arithmetic.',
   null, now() - interval '108 minutes'),

  ('devfx_arena_m2', 'devfx_arena_room_open', 'devfx_challenger', 'text',
   'Writing code was never the bottleneck. Deciding what to build, with incomplete requirements and angry stakeholders, is the job.',
   null, now() - interval '101 minutes'),

  ('devfx_arena_m3', 'devfx_arena_room_open', 'devfx_juror_a', 'text',
   'Every team I know shipped the same headcount this year and twice the surface area. That is replacement happening quietly.',
   null, now() - interval '92 minutes'),

  ('devfx_arena_m4', 'devfx_arena_room_open', 'devfx_arena_u1', 'text',
   'Incomplete requirements are exactly what these models are getting good at negotiating. That moat is thinner than it looks.',
   'devfx_arena_m2', now() - interval '84 minutes'),

  ('devfx_arena_m5', 'devfx_arena_room_open', 'devfx_juror_b', 'text',
   'Name one production system where nobody on call understands the code. You cannot, because that company would already be down.',
   null, now() - interval '71 minutes'),

  ('devfx_arena_m6', 'devfx_arena_room_open', 'devfx_arguer', 'text',
   'Genuinely torn. The output quality argument convinces me; the accountability argument convinces me more.',
   null, now() - interval '58 minutes'),

  ('devfx_arena_m7', 'devfx_arena_room_open', 'devfx_challenger', 'text',
   '"Most" is doing enormous work in this topic. A tool that makes ten developers as productive as thirty replaces nobody — it raises the ceiling.',
   null, now() - interval '36 minutes'),

  ('devfx_arena_m8', 'devfx_arena_room_open', 'devfx_clash_test', 'text',
   'It raises the ceiling and lowers the floor at the same time. The floor is where most of the jobs are.',
   'devfx_arena_m7', now() - interval '21 minutes');

-- Evidence is a first-class row, not a message. Both of these are `link` kind:
-- an image citation needs an owned, ready media_object, which a seed cannot
-- fabricate without also writing a storage object.
insert into public.arena_room_evidence
  (id, room_id, topic_id, author_id, message_id, kind, title, source_url, useful_count, created_at)
values
  ('devfx_arena_ev_1', 'devfx_arena_room_open', 'devfx_arena_topic_live', 'devfx_challenger',
   'devfx_arena_m2', 'link',
   'Developer survey: AI assists on most tasks, owns almost none',
   'https://survey.stackoverflow.co/2025/ai', 3, now() - interval '95 minutes'),

  ('devfx_arena_ev_2', 'devfx_arena_room_open', 'devfx_arena_topic_live', 'devfx_arena_u1',
   null, 'link',
   'Headcount vs shipped surface area, 2019 to 2026',
   'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&h=800&fit=crop',
   1, now() - interval '66 minutes');

-- `useful_count` is recomputed from this table on every toggle, so the seeded
-- counter above has to match the marks exactly or the first tap would "fix" it.
insert into public.arena_room_evidence_marks (evidence_id, profile_id, created_at) values
  ('devfx_arena_ev_1', 'devfx_juror_a',  now() - interval '90 minutes'),
  ('devfx_arena_ev_1', 'devfx_juror_b',  now() - interval '88 minutes'),
  ('devfx_arena_ev_1', 'devfx_arena_u1', now() - interval '75 minutes'),
  ('devfx_arena_ev_2', 'devfx_arguer',   now() - interval '60 minutes');

insert into public.arena_room_message_reactions (message_id, profile_id, emoji, created_at) values
  ('devfx_arena_m2', 'devfx_juror_a',    '🔥', now() - interval '99 minutes'),
  ('devfx_arena_m2', 'devfx_juror_b',    '🔥', now() - interval '97 minutes'),
  ('devfx_arena_m2', 'devfx_arena_u1',   '👏', now() - interval '96 minutes'),
  ('devfx_arena_m3', 'devfx_arguer',     '🔥', now() - interval '90 minutes'),
  ('devfx_arena_m5', 'devfx_clash_test', '🔥', now() - interval '68 minutes'),
  ('devfx_arena_m8', 'devfx_arena_u1',   '🔥', now() - interval '18 minutes');

-- ── SETTLED room (verdict / best argument / Mindshift UI) ───────────────────
insert into public.arena_rooms
  (id, topic_id, status, capacity, participant_count, opens_at, closes_at, created_at)
values
  ('devfx_arena_room_settled', 'devfx_arena_topic_settled', 'SETTLED', 40, 5,
   now() - interval '28 hours', now() - interval '4 hours', now() - interval '28 hours');

-- Four of five recorded a final stance; two of those moved → 50% Mindshift.
insert into public.arena_room_participants
  (room_id, topic_id, profile_id, initial_stance, final_stance, final_recorded_at, role, joined_at)
values
  ('devfx_arena_room_settled', 'devfx_arena_topic_settled', 'devfx_clash_test', 'AGREE',    'AGREE', now() - interval '3 hours', 'debater', now() - interval '27 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_topic_settled', 'devfx_challenger', 'DISAGREE', 'AGREE', now() - interval '3 hours', 'debater', now() - interval '27 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_topic_settled', 'devfx_arena_u1',   'AGREE',    'AGREE', now() - interval '3 hours', 'debater', now() - interval '26 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_topic_settled', 'devfx_arena_u2',   'DISAGREE', 'UNSURE', now() - interval '3 hours', 'debater', now() - interval '26 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_topic_settled', 'devfx_arena_u3',   'AGREE',    null, null, 'debater', now() - interval '25 hours');

insert into public.arena_room_messages
  (id, room_id, author_id, kind, body, parent_message_id, created_at)
values
  ('devfx_arena_sm1', 'devfx_arena_room_settled', 'devfx_clash_test', 'text',
   'Velocity is not the metric. Remote teams write things down, and written decisions survive the people who made them.',
   null, now() - interval '26 hours'),
  ('devfx_arena_sm2', 'devfx_arena_room_settled', 'devfx_challenger', 'text',
   'Every remote team I have shipped with was slower for six weeks and then faster forever, because the slow part was building the habits in-person teams never need to build.',
   null, now() - interval '25 hours'),
  ('devfx_arena_sm3', 'devfx_arena_room_settled', 'devfx_arena_u2', 'text',
   'Counterpoint: the six weeks never ends if you keep hiring. Onboarding cost is the whole argument.',
   'devfx_arena_sm2', now() - interval '24 hours'),
  ('devfx_arena_sm4', 'devfx_arena_room_settled', 'devfx_arena_u3', 'text',
   'Both of these are really arguments about documentation discipline, not about desks.',
   null, now() - interval '23 hours');

-- Ballots stay private rows; the public tally is the result below.
insert into public.arena_room_side_votes (room_id, profile_id, side, created_at) values
  ('devfx_arena_room_settled', 'devfx_clash_test', 'AGREE',    now() - interval '5 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_u1',   'AGREE',    now() - interval '5 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_u3',   'AGREE',    now() - interval '5 hours'),
  ('devfx_arena_room_settled', 'devfx_challenger', 'DISAGREE', now() - interval '5 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_u2',   'DISAGREE', now() - interval '5 hours');

insert into public.arena_room_argument_votes (room_id, profile_id, message_id, created_at) values
  ('devfx_arena_room_settled', 'devfx_clash_test', 'devfx_arena_sm2', now() - interval '5 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_u1',   'devfx_arena_sm2', now() - interval '5 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_u2',   'devfx_arena_sm2', now() - interval '5 hours'),
  ('devfx_arena_room_settled', 'devfx_challenger', 'devfx_arena_sm1', now() - interval '5 hours'),
  ('devfx_arena_room_settled', 'devfx_arena_u3',   'devfx_arena_sm1', now() - interval '5 hours');

insert into public.arena_room_results
  (room_id, winning_side, agree_votes, disagree_votes,
   best_argument_message_id, best_argument_author_id,
   participant_count, mindshift_changed_count, mindshift_completed_count, settled_at)
values
  ('devfx_arena_room_settled', 'AGREE', 3, 2,
   'devfx_arena_sm2', 'devfx_challenger',
   5, 2, 4, now() - interval '3 hours 30 minutes');

commit;

-- Smoke notice for operators (visible in psql / docker logs).
do $$
begin
  raise notice 'clash_dev_fixtures: ready — @clash_test takes + open STANDARD/BLIND + settled Clash + live/settled Arena topics';
end $$;
