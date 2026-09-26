-- ============================================================================
-- CLASH 2.0 · Supabase seed — the demo Arena
-- ----------------------------------------------------------------------------
-- Populates the tables created by supabase/schema.sql from the same data the
-- app ships in data/mockUsers.ts, data/mockTakes.ts and data/mockComments.ts,
-- so a fresh project looks exactly like the prototype on first launch.
--
-- DESTRUCTIVE: it truncates the four Arena tables before inserting, which resets
--   the demo dataset. Safe on a new project; never run it over real users.
--   (Re-run it any time takes have expired to make the feed live again.)
--
-- Run:  Dashboard → SQL Editor → paste → Run
--       Local stack → list this file under [db.seed] sql_paths in
--                     supabase/config.toml, then `supabase db reset`
--
-- Notes
--   · timestamps are relative to now(), matching `SEED_NOW` in data/mockTakes.ts,
--     so every take is live and `t-flagship` still shows the spec's "2h 41m left".
--   · media_url values are placeholders: media is a gradient plate on the client.
--   · `comments.upvotes_count` is seeded from the mocks as historical total, while
--     `comment_upvotes` only holds the viewer's own rows — that is the +1 you will
--     see on the three comments the viewer already voted on.
--   · to let the app WRITE (RLS wants an owned, authenticated profile), claim the
--     seeded viewer once, after the app has signed in:
--       select id from auth.users order by created_at desc limit 1;   -- copy it
--       update public.profiles set auth_user_id = '<that-uid>' where id = 'u-viewer';
-- ============================================================================

truncate table
  public.comment_upvotes,
  public.comments,
  public.takes,
  public.profiles
cascade;

-- ── profiles (11) ───────────────────────────────────────────────────────────
-- Seeded with identities, not permissions: only the viewer, one creator and the
-- two hood moderators carry a role, so every RLS branch is exercised by the demo.
insert into public.profiles
  (id, handle, name, avatar_tint, bio, home_hood, role, moderated_hoods,
   reputation, coins, streak, rank)
values
  ('u-viewer', 'aryan.dev', 'Aryan Dev', '#FF6A3D',
   'Final-year dev. Hot takes on placements, phones and monsoon traffic.',
   'campushustle', 'viewer', '{}', 8420, 1240, 7, 'Firestarter'),
  ('u-maya', 'maya', 'Maya Rane', '#FF6A3D', null, 'techtakes', 'creator', '{}',
   13480, 2210, 11, 'Provocateur'),
  ('u-liam', 'liam', 'Liam Fernandes', '#3D8BFF', null, 'techtakes', 'viewer', '{}',
   9140, 1580, 4, 'Firestarter'),
  ('u-aarav', 'aarav', 'Aarav Shetty', '#FFC861', null, 'techtakes', 'viewer', '{}',
   1620, 410, 2, 'Hot Take'),
  ('u-zoya', 'zoya', 'Zoya Khan', '#A580FF', null, 'campushustle', 'moderator',
   '{campushustle}', 12060, 1990, 9, 'Provocateur'),
  ('u-ishaan', 'ishaan', 'Ishaan Naik', '#43D6A0', null, 'goatalk', 'viewer', '{}',
   6890, 980, 5, 'Firestarter'),
  ('u-riya', 'riya', 'Riya Salgaonkar', '#FF4D5E', null, 'movies', 'moderator',
   '{movies}', 27300, 4310, 14, 'Clash King'),
  ('u-kabir', 'kabir', 'Kabir Sethi', '#98A0B0', null, 'gaming', 'viewer', '{}',
   1340, 300, 1, 'Hot Take'),
  ('u-tanvi', 'tanvi', 'Tanvi Rao', '#FF9A4D', null, 'startups', 'viewer', '{}',
   520, 150, 3, 'Instigator'),
  ('u-neel', 'neel', 'Neel Kamat', '#3D8BFF', null, 'football', 'viewer', '{}',
   5240, 870, 6, 'Firestarter'),
  ('u-ananya', 'ananya', 'Ananya Desai', '#FFC861', null, 'techtakes', 'viewer', '{}',
   180, 40, 1, 'Rookie');

-- ── takes (11) ──────────────────────────────────────────────────────────────
-- `age_minutes` mirrors data/mockTakes.ts; the window and the engagement counters
-- are derived here exactly the way the app derives them (24h expiry, heat rank),
-- so the server and the prototype agree on what is live and what is hot.
insert into public.takes
  (id, author_id, hood, text, media_url, media_kind, media_caption, media_colors,
   media_duration, created_at, expires_at, clashes_count, reactions_count)
select
  s.id,
  s.author_id,
  s.hood::public.hood_id,
  s.text,
  s.media_url,
  s.media_kind::public.media_kind,
  s.media_caption,
  s.media_colors::text[],
  s.media_duration,
  now() - make_interval(mins => s.age_minutes),
  now() - make_interval(mins => s.age_minutes) + interval '24 hours',
  s.clashes,
  s.reactions
from (values
  ('t-pixel', 'u-maya', 'techtakes', 'Pixel takes better photos than the iPhone.',
   'https://media.clash.app/takes/t-pixel-night-mode.jpg', 'image',
   'Night mode, 48MP, zero edits', '{#B794FF,#6C63FF}', null, 200, 42, 318),
  -- Lands on the spec example: "2h 41m left".
  ('t-flagship', 'u-aarav', 'techtakes',
   'Android flagships have officially caught up with iPhone.',
   null, null, null, null, null, 1279, 18, 205),
  ('t-trailers', 'u-riya', 'movies',
   'AI-generated videos are already better than most Hollywood trailers.',
   'https://media.clash.app/takes/t-trailers-teaser.mp4', 'video',
   'Leaked teaser, 18 seconds', '{#FF8A4C,#FF4D6A}', '0:18', 50, 96, 1240),
  ('t-degree', 'u-zoya', 'campushustle', 'The campus degree is becoming obsolete.',
   null, null, null, null, null, 310, 63, 512),
  ('t-monsoon', 'u-ishaan', 'goatalk', 'Goa in monsoon beats Goa in December.',
   'https://media.clash.app/takes/t-monsoon-empty-beach.jpg', 'image',
   'Saturday, 6:12 PM, empty beach', '{#57A0FF,#7A6BFF}', null, 380, 37, 289),
  ('t-matchmaking', 'u-kabir', 'gaming', 'Ranked matchmaking ruined casual gaming.',
   null, null, null, null, null, 430, 54, 401),
  ('t-distribution', 'u-tanvi', 'startups',
   'Most startup ideas die from distribution, not from the product.',
   null, null, null, null, null, 505, 22, 160),
  ('t-highlights', 'u-neel', 'football',
   'Football highlights are better than watching the full match.',
   null, null, null, null, null, 560, 71, 640),
  ('t-iphone-price', 'u-ananya', 'techtakes',
   'iPhone users pay too much for the same experience.',
   null, null, null, null, null, 70, 88, 730),
  ('t-viewer-sleep', 'u-viewer', 'campushustle',
   'Everyone is faking productivity with three apps and no sleep.',
   null, null, null, null, null, 140, 14, 96),
  ('t-viewer-placements', 'u-viewer', 'campushustle',
   'Placements matter less than your first two years of real work.',
   'https://media.clash.app/takes/t-viewer-placements-curve.jpg', 'image',
   'First offer vs fifth year — the real curve', '{#FFE0A3,#FFA53D}', null, 660, 31, 240)
) as s(id, author_id, hood, text, media_url, media_kind, media_caption, media_colors,
       media_duration, age_minutes, clashes, reactions);

-- ── comments / rebuttals (22) ───────────────────────────────────────────────
-- Two per take, mirroring data/mockComments.ts. `is_pinned` marks the rebuttal
-- that leads a take (the "reigning" one in CommentList), and `age_minutes` keeps
-- the age ordering the prototype shows.
insert into public.comments
  (id, take_id, author_id, text, upvotes_count, is_pinned, created_at)
select c.id, c.take_id, c.author_id, c.text, c.upvotes, c.is_pinned,
       now() - make_interval(mins => c.age_minutes)
from (values
  ('c-pixel-1', 't-pixel', 'u-liam',
   'Photos aren''t the whole story. iPhone still dominates video.', 214, true, 180),
  ('c-pixel-2', 't-pixel', 'u-zoya',
   'Gcam port on Pixel still clears iPhone night mode for half the price.', 96, false, 120),
  ('c-flagship-1', 't-flagship', 'u-liam',
   'Caught up on specs, still behind on resale value.', 158, true, 120),
  ('c-flagship-2', 't-flagship', 'u-maya',
   'Trade-in counters disagree — Pixels hold better than they used to.', 71, false, 60),
  ('c-trailers-1', 't-trailers', 'u-maya',
   'Trailers are marketing. Nobody is watching AI for two hours.', 402, true, 90),
  ('c-trailers-2', 't-trailers', 'u-kabir',
   'Give it a year — short AI films already beat ad spots.', 133, false, 60),
  ('c-degree-1', 't-degree', 'u-ananya',
   'The degree is a visa for your first job. Try skipping it.', 287, true, 240),
  ('c-degree-2', 't-degree', 'u-viewer',
   'Skills get interviews, degrees get shortlists. You need both.', 112, false, 180),
  ('c-monsoon-1', 't-monsoon', 'u-zoya',
   'December Goa is crowded because it is actually good.', 176, true, 300),
  ('c-monsoon-2', 't-monsoon', 'u-riya',
   'Empty monsoon beaches beat Baga traffic any day.', 149, false, 240),
  ('c-matchmaking-1', 't-matchmaking', 'u-neel',
   'Without ranked I have no reason to queue twice.', 198, true, 360),
  ('c-matchmaking-2', 't-matchmaking', 'u-ishaan',
   'Casual lobbies died when everyone started try-harding ranked.', 84, false, 300),
  ('c-distribution-1', 't-distribution', 'u-viewer',
   'Bad product kills more startups than bad marketing.', 121, true, 420),
  ('c-distribution-2', 't-distribution', 'u-tanvi',
   'Nobody sees a great product with zero distribution either.', 77, false, 360),
  ('c-highlights-1', 't-highlights', 'u-kabir',
   'Highlights delete the tension that makes football football.', 265, true, 480),
  ('c-highlights-2', 't-highlights', 'u-neel',
   'Ninety minutes plus stoppage time is a luxury, not a habit.', 118, false, 420),
  ('c-iphone-price-1', 't-iphone-price', 'u-maya',
   'You are paying for the support cycle, not the hardware sheet.', 311, true, 120),
  ('c-iphone-price-2', 't-iphone-price', 'u-aarav',
   'Five years of updates is worth the premium alone.', 104, false, 60),
  ('c-sleep-1', 't-viewer-sleep', 'u-tanvi',
   'Busy is not the same as productive, but the apps do help.', 89, true, 120),
  ('c-sleep-2', 't-viewer-sleep', 'u-zoya',
   'Sleep beats streaks. The apps just document the burnout.', 63, false, 60),
  ('c-place-1', 't-viewer-placements', 'u-riya',
   'The campus network still decides the first offer.', 142, true, 540),
  ('c-place-2', 't-viewer-placements', 'u-ananya',
   'After the first job nobody asks your CGPA again.', 98, false, 480)
) as c(id, take_id, author_id, text, upvotes, is_pinned, age_minutes);

-- ── comment_upvotes (3) ─────────────────────────────────────────────────────
-- Only the viewer's own votes: private rows behind RLS. Everything else in each
-- tally is the seeded historical total on comments.upvotes_count.
insert into public.comment_upvotes (comment_id, user_id)
values
  ('c-pixel-1', 'u-viewer'),
  ('c-trailers-1', 'u-viewer'),
  ('c-iphone-price-1', 'u-viewer');

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: 11 profiles · 11 takes · 11 live · 22 rebuttals · 3 votes.
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.takes) as takes,
  (select count(*) from public.takes
    where status = 'active' and expires_at > now()) as live_takes,
  (select count(*) from public.comments) as rebuttals,
  (select count(*) from public.comment_upvotes) as votes;


