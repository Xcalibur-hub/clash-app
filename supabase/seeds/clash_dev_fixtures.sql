-- ============================================================================
-- CLASH · Development Clash fixtures (LOCAL ONLY)
-- ----------------------------------------------------------------------------
-- Synthetic profiles + Takes + Clashes so a real signed-in developer can:
--   other user's Take → reply → CLASH → Standard/Blind → judge.
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
delete from public.reputation_events where clash_id like 'devfx_%' or id like 'devfx_%';
delete from public.verdicts where clash_id like 'devfx_%';
delete from public.judgements where clash_id like 'devfx_%';
delete from public.clashes where id like 'devfx_%';
delete from public.comment_upvotes where comment_id like 'devfx_%';
delete from public.comments where id like 'devfx_%';
delete from public.takes where id like 'devfx_%';
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
   'campushustle', 'viewer', '{}', 600, 80, 1, 'Rookie');

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

commit;

-- Smoke notice for operators (visible in psql / docker logs).
do $$
begin
  raise notice 'clash_dev_fixtures: ready — @clash_test takes + open STANDARD/BLIND + settled Clash';
end $$;
