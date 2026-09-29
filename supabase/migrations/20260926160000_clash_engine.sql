-- ============================================================================
-- CLASH 2.0 · 0005 — server-authoritative Clash + reputation engine
-- ----------------------------------------------------------------------------
-- The client can no longer decide the jury, the winner, the tally, validity of a
-- ballot, settlement timing, or any reputation/coin/rank/streak/wins change. It
-- only requests actions (start_clash, submit_judgement, settle_clash) and reads
-- the server results (clashes, verdicts, reputation_events).
--
-- JURY MODEL — the repository's semantics are PUBLIC judging: any authenticated
-- user (except the two debaters) casts one ballot per Clash, and the verdict is
-- the tally of those ballots. The mock 9-person jury in the prototype was a
-- display flavor, so `judgements` is the jury (one seat per profile, PK-enforced)
-- and there is no separate pre-assigned `jury_assignments` table. Target jury
-- size 9 is the production aspiration; settlement requires a minimum of 1 ballot
-- locally and would raise that threshold + add a real selection step later.
-- ============================================================================

-- ── 1. Domain types ─────────────────────────────────────────────────────────
do $$ begin
  create type public.clash_status as enum ('open', 'settled', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clash_side as enum ('A', 'B');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reputation_kind as enum ('clash_participation', 'clash_win', 'clash_dissent');
exception when duplicate_object then null; end $$;

-- ── 2. Derived rank (pure, immutable — matches utils/reputation.ts) ─────────
create or replace function public.rank_for_rep(p_rep bigint)
returns public.rank_name
language sql
immutable
as $$
  select case
    when p_rep >= 50000 then 'Legend'
    when p_rep >= 25000 then 'Clash King'
    when p_rep >= 11000 then 'Provocateur'
    when p_rep >= 2400  then 'Firestarter'
    when p_rep >= 900   then 'Hot Take'
    when p_rep >= 300   then 'Instigator'
    else 'Rookie' end::public.rank_name;
$$;

-- ── 3. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.clashes (
  id                    text primary key,
  take_id               text not null references public.takes (id) on delete cascade,
  challenger_id         text not null references public.profiles (id) on delete cascade,
  challenger_comment_id text references public.comments (id) on delete set null,
  status                public.clash_status not null default 'open',
  opens_at              timestamptz not null default now(),
  closes_at             timestamptz not null,
  created_at            timestamptz not null default now(),
  settled_at            timestamptz,
  check (closes_at > opens_at)
);
create index if not exists clashes_take_idx on public.clashes (take_id);
create index if not exists clashes_status_idx on public.clashes (status, closes_at);

-- One ballot per profile per clash — the "jury" is the set of public voters.
create table if not exists public.judgements (
  clash_id   text not null references public.clashes (id) on delete cascade,
  juror_id   text not null references public.profiles (id) on delete cascade,
  side       public.clash_side not null,
  created_at timestamptz not null default now(),
  primary key (clash_id, juror_id)
);
create index if not exists judgements_clash_idx on public.judgements (clash_id);

-- Exactly one verdict per clash.
create table if not exists public.verdicts (
  clash_id      text primary key references public.clashes (id) on delete cascade,
  winner_side   public.clash_side not null,
  side_a_score  integer not null check (side_a_score >= 0),
  side_b_score  integer not null check (side_b_score >= 0),
  jury_size     integer not null check (jury_size >= 0),
  agreement     numeric(5,4) not null check (agreement >= 0 and agreement <= 1),
  margin        integer not null check (margin >= 0),
  verdict_label text not null,
  created_at    timestamptz not null default now()
);

-- Immutable reward ledger. Every reputation/coin change has a row here.
create table if not exists public.reputation_events (
  id               text primary key,
  profile_id       text not null references public.profiles (id) on delete cascade,
  clash_id         text references public.clashes (id) on delete set null,
  kind             public.reputation_kind not null,
  reputation_delta integer not null,
  coins_delta      integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists reputation_events_profile_idx on public.reputation_events (profile_id, created_at desc);
create index if not exists reputation_events_clash_idx on public.reputation_events (clash_id);

-- ── 4. Notification helper + Clash start / ballot RPCs ──────────────────────
/** Server-only notification insert — clients can never write these directly. */
create or replace function public.clash_notify(
  p_recipient text,
  p_actor     text,
  p_kind      public.notification_kind,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
  values (
    'n_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    p_recipient, p_actor, p_kind, 'clash', p_entity_id
  );
end;
$$;

/** Start a Clash as the signed-in challenger. Returns the new clash id. */
create or replace function public.start_clash(p_take_id text, p_comment_id text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenger text := public.my_profile_id();
  v_take public.takes%rowtype;
  v_clash_id text;
begin
  if v_challenger is null then
    raise exception 'sign in to start a clash' using errcode = '42501';
  end if;

  select * into v_take from public.takes where id = p_take_id;

  if v_take.id is null then
    raise exception 'take does not exist' using errcode = 'P0002';
  end if;
  if v_take.author_id = v_challenger then
    raise exception 'cannot clash your own take' using errcode = 'P0001';
  end if;
  if v_take.status <> 'active' or v_take.expires_at <= now() then
    raise exception 'take is not live' using errcode = 'P0003';
  end if;

  if p_comment_id is not null and not exists (
    select 1 from public.comments
     where id = p_comment_id and take_id = p_take_id
       and author_id = v_challenger and not is_removed
  ) then
    raise exception 'comment is not yours or not on this take' using errcode = 'P0004';
  end if;

  if exists (
    select 1 from public.clashes
     where take_id = p_take_id and challenger_id = v_challenger and status = 'open'
  ) then
    raise exception 'you already have an open clash on this take' using errcode = 'P0005';
  end if;

  v_clash_id := 'cl_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20));

  insert into public.clashes (id, take_id, challenger_id, challenger_comment_id, status, opens_at, closes_at)
  values (v_clash_id, p_take_id, v_challenger, p_comment_id, 'open', now(), v_take.expires_at);

  perform public.clash_notify(v_take.author_id, v_challenger, 'clash_started', v_clash_id);

  return v_clash_id;
end;
$$;

/** Cast one ballot as the signed-in user (public judging; one ballot per clash). */
create or replace function public.submit_judgement(p_clash_id text, p_side public.clash_side)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_juror text := public.my_profile_id();
  v_clash record;
begin
  if v_juror is null then
    raise exception 'sign in to judge' using errcode = '42501';
  end if;

  select c.take_id, c.challenger_id, c.status, c.closes_at, t.author_id
    into v_clash
    from public.clashes c join public.takes t on t.id = c.take_id
   where c.id = p_clash_id;

  if v_clash.take_id is null then
    raise exception 'clash does not exist' using errcode = 'P0002';
  end if;
  if v_clash.status <> 'open' then
    raise exception 'clash is not open' using errcode = 'P0003';
  end if;
  if v_clash.closes_at <= now() then
    raise exception 'clash has closed' using errcode = 'P0004';
  end if;
  if v_juror = v_clash.challenger_id or v_juror = v_clash.author_id then
    raise exception 'cannot judge your own clash' using errcode = 'P0005';
  end if;

  insert into public.judgements (clash_id, juror_id, side)
  values (p_clash_id, v_juror, p_side)
  on conflict (clash_id, juror_id) do nothing;
end;
$$;

-- ── 5. Settlement (atomic + idempotent) ─────────────────────────────────────
/** Tally the ballots, write one verdict, award reputation/coins, notify. */
create or replace function public.settle_clash(p_clash_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clash record;
  v_a integer;
  v_b integer;
  v_total integer;
  v_winner public.clash_side;
  v_margin integer;
  v_agreement numeric(5,4);
  v_label text;
  j record;
begin
  -- Lock the clash row so concurrent settlements serialize and never double-award.
  select c.id, c.take_id, c.challenger_id, c.status, c.closes_at, t.author_id
    into v_clash from public.clashes c join public.takes t on t.id = c.take_id
   where c.id = p_clash_id for update of c;

  if v_clash.id is null then
    raise exception 'clash does not exist' using errcode = 'P0002';
  end if;

  if v_clash.status = 'settled' then
    return (select jsonb_build_object(
      'clash_id', clash_id, 'winner_side', winner_side, 'side_a_score', side_a_score,
      'side_b_score', side_b_score, 'jury_size', jury_size, 'agreement', agreement,
      'margin', margin, 'verdict_label', verdict_label
    ) from public.verdicts where clash_id = p_clash_id);
  end if;

  if v_clash.closes_at > now() then
    raise exception 'clash has not closed yet' using errcode = 'P0006';
  end if;

  select count(*) filter (where side = 'A'), count(*) filter (where side = 'B')
    into v_a, v_b from public.judgements where clash_id = p_clash_id;

  v_total := v_a + v_b;

  if v_total = 0 then
    update public.clashes set status = 'cancelled' where id = p_clash_id;
    return jsonb_build_object('clash_id', p_clash_id, 'status', 'cancelled', 'jury_size', 0);
  end if;

  v_winner := case when v_b > v_a then 'B' else 'A' end;
  v_margin := abs(v_a - v_b);
  v_agreement := round(greatest(v_a, v_b)::numeric / v_total, 4);
  v_label := case
    when v_margin <= 1 then 'SPLIT DECISION'
    when v_margin <= 3 then 'CLEAR DECISION'
    else 'LANDSLIDE' end;

  insert into public.verdicts (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
  values (p_clash_id, v_winner, v_a, v_b, v_total, v_agreement, v_margin, v_label)
  on conflict (clash_id) do nothing;

  -- Reward each juror and record the immutable ledger.
  for j in select juror_id, side from public.judgements where clash_id = p_clash_id loop
    if j.side = v_winner then
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_participation', 15, 0);
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_win', 105, 40);
      update public.profiles
         set reputation = reputation + 120,
             coins      = coins + 40,
             streak     = streak + 1,
             rank       = public.rank_for_rep(reputation + 120)
       where id = j.juror_id;
    else
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_participation', 15, 0);
      insert into public.reputation_events (id, profile_id, clash_id, kind, reputation_delta, coins_delta)
      values ('re_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
              j.juror_id, p_clash_id, 'clash_dissent', 10, 18);
      update public.profiles
         set reputation = reputation + 25,
             coins      = coins + 18,
             streak     = 0,
             rank       = public.rank_for_rep(reputation + 25)
       where id = j.juror_id;
    end if;

    perform public.clash_notify(j.juror_id, null, 'reputation', p_clash_id);
  end loop;

  -- Result notifications to both debaters.
  perform public.clash_notify(v_clash.author_id, null, 'clash_result', p_clash_id);
  perform public.clash_notify(v_clash.challenger_id, null, 'clash_result', p_clash_id);

  update public.clashes set status = 'settled', settled_at = now() where id = p_clash_id;

  return jsonb_build_object(
    'clash_id', p_clash_id, 'winner_side', v_winner, 'side_a_score', v_a,
    'side_b_score', v_b, 'jury_size', v_total, 'agreement', v_agreement,
    'margin', v_margin, 'verdict_label', v_label
  );
end;
$$;

-- ── 6. Row Level Security ───────────────────────────────────────────────────
alter table public.clashes            enable row level security;
alter table public.judgements         enable row level security;
alter table public.verdicts           enable row level security;
alter table public.reputation_events  enable row level security;

-- clashes: the debate is public.
drop policy if exists "clashes are readable by everyone" on public.clashes;
create policy "clashes are readable by everyone"
  on public.clashes for select using (true);

-- judgements: private until settled — only the juror (or staff) sees a ballot.
drop policy if exists "a ballot is visible to its juror" on public.judgements;
create policy "a ballot is visible to its juror"
  on public.judgements for select
  using (public.owns_profile(juror_id) or public.is_staff());

-- verdicts: the result is public once it exists.
drop policy if exists "verdicts are readable by everyone" on public.verdicts;
create policy "verdicts are readable by everyone"
  on public.verdicts for select using (true);

-- reputation_events: a public, immutable reward ledger.
drop policy if exists "reputation events are readable by everyone" on public.reputation_events;
create policy "reputation events are readable by everyone"
  on public.reputation_events for select using (true);

-- ── 7. Data API privileges ──────────────────────────────────────────────────
-- New tables inherit 0001's defaults (anon/authenticated SELECT only). Writes go
-- through the RPCs; judgements are private so anon cannot read ballots.
revoke select on public.judgements from anon;

grant execute on function public.start_clash(text, text) to authenticated;
grant execute on function public.submit_judgement(text, public.clash_side) to authenticated;
grant execute on function public.settle_clash(text) to authenticated;

revoke execute on function public.start_clash(text, text) from public, anon;
revoke execute on function public.submit_judgement(text, public.clash_side) from public, anon;
revoke execute on function public.settle_clash(text) from public, anon;
