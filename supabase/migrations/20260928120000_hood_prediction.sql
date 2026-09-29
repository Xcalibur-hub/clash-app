-- ============================================================================
-- CLASH 2.0 · 0022 — Hood Prediction Games
-- ----------------------------------------------------------------------------
-- One production Hood Game type: PREDICTION. A Hood moderator posts a question
-- with 2–4 options; members pick once before the deadline; a moderator resolves
-- the winning option after close. Anti-bandwagon: percentages stay hidden until
-- the game is CLOSED or RESOLVED (and until the viewer has themselves predicted,
-- they see nothing about participation counts either).
--
-- Authority: reuses public.is_hood_moderator(hood) / profiles.moderated_hoods —
-- no second moderator system. No coins, reputation, leaderboards or betting.
--
-- Intentionally deferred: other game types, profile stats, notifications,
-- prizes, changing a prediction after submit.
-- ============================================================================

-- ── 1. Domain types ─────────────────────────────────────────────────────────
do $$ begin
  create type public.hood_game_type as enum ('PREDICTION');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hood_game_status as enum
    ('DRAFT', 'OPEN', 'CLOSED', 'RESOLVED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.hood_games (
  id                 text primary key,
  hood               public.hood_id not null,
  creator_id         text not null references public.profiles (id) on delete cascade,
  game_type          public.hood_game_type not null default 'PREDICTION',
  question           text not null
                     check (char_length(trim(question)) between 1 and 140),
  status             public.hood_game_status not null default 'OPEN',
  opens_at           timestamptz not null default now(),
  closes_at          timestamptz not null,
  resolved_at        timestamptz,
  winning_option_id  text,
  created_at         timestamptz not null default now(),
  check (closes_at > opens_at),
  check (
    (status = 'RESOLVED' and resolved_at is not null and winning_option_id is not null)
    or (status <> 'RESOLVED' and resolved_at is null)
  )
);

create index if not exists hood_games_hood_status_idx
  on public.hood_games (hood, status, closes_at);
create index if not exists hood_games_open_close_idx
  on public.hood_games (status, closes_at)
  where status = 'OPEN';

create table if not exists public.hood_game_options (
  id         text primary key,
  game_id    text not null references public.hood_games (id) on delete cascade,
  label      text not null
             check (char_length(trim(label)) between 1 and 60),
  position   smallint not null check (position between 1 and 4),
  created_at timestamptz not null default now(),
  unique (game_id, position),
  unique (game_id, label)
);

create index if not exists hood_game_options_game_idx
  on public.hood_game_options (game_id, position);

-- Winning option must belong to the same game (added after options table exists).
do $$ begin
  alter table public.hood_games
    add constraint hood_games_winning_option_fkey
    foreign key (winning_option_id) references public.hood_game_options (id);
exception when duplicate_object then null; end $$;

create table if not exists public.hood_game_entries (
  game_id    text not null references public.hood_games (id) on delete cascade,
  profile_id text not null references public.profiles (id) on delete cascade,
  option_id  text not null references public.hood_game_options (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

create index if not exists hood_game_entries_option_idx
  on public.hood_game_entries (game_id, option_id);

-- ── 3. create_prediction_game ───────────────────────────────────────────────
create or replace function public.create_prediction_game(
  p_hood      public.hood_id,
  p_question  text,
  p_options   text[],
  p_closes_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_question text := trim(p_question);
  v_game_id text;
  v_option_id text;
  v_label text;
  v_seen text[] := '{}';
  v_i integer;
  v_count integer;
begin
  if v_creator is null then
    raise exception 'sign in to create a prediction' using errcode = '42501';
  end if;
  if not public.is_hood_moderator(p_hood) then
    raise exception 'not authorized for this hood' using errcode = '42501';
  end if;
  if v_question is null or char_length(v_question) < 1 or char_length(v_question) > 140 then
    raise exception 'question must be 1–140 characters' using errcode = 'P0001';
  end if;
  if p_closes_at is null or p_closes_at <= now() then
    raise exception 'closes_at must be in the future' using errcode = 'P0002';
  end if;
  if p_options is null then
    raise exception 'provide 2–4 options' using errcode = 'P0003';
  end if;
  v_count := coalesce(array_length(p_options, 1), 0);
  if v_count < 2 or v_count > 4 then
    raise exception 'provide 2–4 options' using errcode = 'P0003';
  end if;

  for v_i in 1..v_count loop
    v_label := trim(p_options[v_i]);
    if v_label is null or char_length(v_label) < 1 or char_length(v_label) > 60 then
      raise exception 'each option must be 1–60 characters' using errcode = 'P0004';
    end if;
    if exists (
      select 1 from unnest(v_seen) as s(label) where lower(s.label) = lower(v_label)
    ) then
      raise exception 'options must be unique' using errcode = 'P0005';
    end if;
    v_seen := array_append(v_seen, v_label);
  end loop;

  v_game_id := 'hg_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 20));

  insert into public.hood_games (
    id, hood, creator_id, game_type, question, status, opens_at, closes_at
  ) values (
    v_game_id, p_hood, v_creator, 'PREDICTION', v_question, 'OPEN', now(), p_closes_at
  );

  for v_i in 1..v_count loop
    v_option_id := 'hgo_' || lower(substr(md5(random()::text || clock_timestamp()::text || v_i::text), 1, 20));
    insert into public.hood_game_options (id, game_id, label, position)
    values (v_option_id, v_game_id, v_seen[v_i], v_i::smallint);
  end loop;

  return v_game_id;
end;
$$;

-- ── 4. submit_prediction ────────────────────────────────────────────────────
create or replace function public.submit_prediction(
  p_game_id   text,
  p_option_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_game public.hood_games%rowtype;
  v_option public.hood_game_options%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to predict' using errcode = '42501';
  end if;

  select * into v_game from public.hood_games where id = p_game_id;
  if v_game.id is null then
    raise exception 'game does not exist' using errcode = 'P0002';
  end if;
  if v_game.status <> 'OPEN' or v_game.closes_at <= now() then
    raise exception 'prediction is closed' using errcode = 'P0003';
  end if;

  select * into v_option
    from public.hood_game_options
   where id = p_option_id and game_id = p_game_id;
  if v_option.id is null then
    raise exception 'option does not belong to this game' using errcode = 'P0004';
  end if;

  if exists (
    select 1 from public.hood_game_entries e
     where e.game_id = p_game_id and e.profile_id = v_user
  ) then
    raise exception 'prediction already submitted' using errcode = 'P0006';
  end if;

  insert into public.hood_game_entries (game_id, profile_id, option_id)
  values (p_game_id, v_user, p_option_id);

  return jsonb_build_object(
    'gameId', p_game_id,
    'optionId', p_option_id,
    'createdAt', now()
  );
end;
$$;

-- ── 5. resolve_prediction_game ──────────────────────────────────────────────
create or replace function public.resolve_prediction_game(
  p_game_id           text,
  p_winning_option_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_game public.hood_games%rowtype;
  v_option public.hood_game_options%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to resolve' using errcode = '42501';
  end if;

  select * into v_game from public.hood_games where id = p_game_id for update;
  if v_game.id is null then
    raise exception 'game does not exist' using errcode = 'P0002';
  end if;
  if not public.is_hood_moderator(v_game.hood) then
    raise exception 'not authorized for this hood' using errcode = '42501';
  end if;

  -- Idempotent: already resolved with the same winner is a no-op success.
  if v_game.status = 'RESOLVED' then
    if v_game.winning_option_id = p_winning_option_id then
      return jsonb_build_object(
        'gameId', v_game.id,
        'status', v_game.status,
        'winningOptionId', v_game.winning_option_id,
        'resolvedAt', v_game.resolved_at
      );
    end if;
    raise exception 'game already resolved' using errcode = 'P0008';
  end if;

  if v_game.status = 'CANCELLED' then
    raise exception 'game is cancelled' using errcode = 'P0009';
  end if;
  if v_game.status = 'OPEN' and v_game.closes_at > now() then
    raise exception 'game is still open' using errcode = 'P0003';
  end if;
  -- OPEN past closes_at, or CLOSED, may resolve.
  if v_game.status not in ('OPEN', 'CLOSED') then
    raise exception 'game cannot be resolved' using errcode = 'P0007';
  end if;

  select * into v_option
    from public.hood_game_options
   where id = p_winning_option_id and game_id = p_game_id;
  if v_option.id is null then
    raise exception 'winning option must belong to this game' using errcode = 'P0004';
  end if;

  update public.hood_games
     set status = 'RESOLVED',
         winning_option_id = p_winning_option_id,
         resolved_at = now()
   where id = p_game_id
  returning * into v_game;

  return jsonb_build_object(
    'gameId', v_game.id,
    'status', v_game.status,
    'winningOptionId', v_game.winning_option_id,
    'resolvedAt', v_game.resolved_at
  );
end;
$$;

-- ── 6. Automatic close (OPEN → CLOSED) ──────────────────────────────────────
create or replace function public.close_prediction_games(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select id
      from public.hood_games
     where status = 'OPEN'
       and closes_at <= now()
     order by closes_at
     limit greatest(p_limit, 0)
     for update skip locked
  )
  update public.hood_games g
     set status = 'CLOSED'
    from due
   where g.id = due.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.run_maintenance(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clashes integer;
  v_takes   integer;
  v_media   jsonb;
  v_rates   integer;
  v_drops   integer;
  v_subs    integer;
  v_preds   integer;
begin
  select public.settle_due_clashes(p_limit) into v_clashes;
  select public.expire_stale_takes(p_limit) into v_takes;
  select public.cleanup_stale_media(least(p_limit, 100)) into v_media;
  select public.cleanup_rate_limits(interval '7 days') into v_rates;
  select public.expire_vault_drops(p_limit) into v_drops;
  select public.expire_vault_subscriptions(p_limit) into v_subs;
  select public.close_prediction_games(p_limit) into v_preds;

  return jsonb_build_object(
    'clashes_settled', v_clashes,
    'takes_expired', v_takes,
    'media', v_media,
    'rate_limits_pruned', v_rates,
    'vault_drops_expired', v_drops,
    'vault_subscriptions_expired', v_subs,
    'prediction_games_closed', v_preds
  );
end;
$$;

-- ── 7. Authoritative read ───────────────────────────────────────────────────
create or replace function public.hood_game_view(p_game_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_game public.hood_games%rowtype;
  v_entry_option text;
  v_has_entry boolean;
  v_aggregates_visible boolean;
  v_total integer;
  v_correct integer;
  v_options jsonb := '[]'::jsonb;
  r record;
  v_count integer;
  v_may_predict boolean;
  v_may_resolve boolean;
  v_effective_status public.hood_game_status;
begin
  select * into v_game from public.hood_games where id = p_game_id;
  if v_game.id is null then
    return null;
  end if;

  -- Treat past-due OPEN as CLOSED for read semantics even before maintenance runs.
  v_effective_status := case
    when v_game.status = 'OPEN' and v_game.closes_at <= now() then 'CLOSED'::public.hood_game_status
    else v_game.status
  end;

  select e.option_id into v_entry_option
    from public.hood_game_entries e
   where e.game_id = p_game_id and v_viewer is not null and e.profile_id = v_viewer;
  v_has_entry := found;

  v_aggregates_visible := v_effective_status in ('CLOSED', 'RESOLVED');

  select count(*)::integer into v_total
    from public.hood_game_entries e where e.game_id = p_game_id;

  v_may_predict :=
    v_viewer is not null
    and not v_has_entry
    and v_game.status = 'OPEN'
    and v_game.closes_at > now();

  v_may_resolve :=
    v_viewer is not null
    and public.is_hood_moderator(v_game.hood)
    and v_effective_status in ('CLOSED', 'OPEN')
    and (v_game.status = 'CLOSED' or v_game.closes_at <= now())
    and v_game.status <> 'RESOLVED';

  for r in
    select o.id, o.label, o.position
      from public.hood_game_options o
     where o.game_id = p_game_id
     order by o.position
  loop
    select count(*)::integer into v_count
      from public.hood_game_entries e
     where e.game_id = p_game_id and e.option_id = r.id;

    v_options := v_options || jsonb_build_array(jsonb_build_object(
      'id', r.id,
      'label', r.label,
      'position', r.position,
      'count', case when v_aggregates_visible then to_jsonb(v_count) else 'null'::jsonb end,
      'percent', case
        when v_aggregates_visible and v_total > 0 then to_jsonb(round((100.0 * v_count) / v_total))
        when v_aggregates_visible then to_jsonb(0)
        else 'null'::jsonb
      end,
      'isWinner', case
        when v_game.status = 'RESOLVED' then to_jsonb(v_game.winning_option_id = r.id)
        else 'null'::jsonb
      end
    ));
  end loop;

  if v_game.status = 'RESOLVED' and v_game.winning_option_id is not null then
    select count(*)::integer into v_correct
      from public.hood_game_entries e
     where e.game_id = p_game_id and e.option_id = v_game.winning_option_id;
  else
    v_correct := null;
  end if;

  return jsonb_build_object(
    'id', v_game.id,
    'hood', v_game.hood,
    'type', v_game.game_type,
    'question', v_game.question,
    'status', v_effective_status,
    'opensAt', v_game.opens_at,
    'closesAt', v_game.closes_at,
    'resolvedAt', v_game.resolved_at,
    'winningOptionId', v_game.winning_option_id,
    'options', v_options,
    'viewerOptionId', v_entry_option,
    'hasPredicted', v_has_entry,
    'mayPredict', v_may_predict,
    'mayResolve', v_may_resolve,
    -- Anti-bandwagon: total only after the viewer has predicted (or game ended).
    'totalParticipants', case
      when v_aggregates_visible then to_jsonb(v_total)
      when v_has_entry then to_jsonb(v_total)
      else 'null'::jsonb
    end,
    'correctCount', case when v_game.status = 'RESOLVED' then to_jsonb(v_correct) else 'null'::jsonb end,
    'correctPercent', case
      when v_game.status = 'RESOLVED' and v_total > 0
        then to_jsonb(round((100.0 * v_correct) / v_total))
      when v_game.status = 'RESOLVED' then to_jsonb(0)
      else 'null'::jsonb
    end,
    'viewerCorrect', case
      when v_game.status = 'RESOLVED' and v_has_entry
        then to_jsonb(v_entry_option = v_game.winning_option_id)
      else 'null'::jsonb
    end
  );
end;
$$;

/** Active OPEN (or just-closed) prediction for a Hood page PLAY shelf. */
create or replace function public.hood_active_prediction(p_hood public.hood_id)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  select g.id into v_id
    from public.hood_games g
   where g.hood = p_hood
     and g.game_type = 'PREDICTION'
     and g.status in ('OPEN', 'CLOSED', 'RESOLVED')
     and (
       g.status = 'OPEN'
       or g.closes_at > now() - interval '48 hours'
     )
   order by
     case g.status when 'OPEN' then 0 when 'CLOSED' then 1 else 2 end,
     g.closes_at desc
   limit 1;

  if v_id is null then
    return null;
  end if;
  return public.hood_game_view(v_id);
end;
$$;

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
alter table public.hood_games enable row level security;
alter table public.hood_game_options enable row level security;
alter table public.hood_game_entries enable row level security;

-- Games and options are public metadata (aggregates go through the view RPC).
drop policy if exists "hood games are readable" on public.hood_games;
create policy "hood games are readable"
  on public.hood_games for select to anon, authenticated
  using (true);

drop policy if exists "hood game options are readable" on public.hood_game_options;
create policy "hood game options are readable"
  on public.hood_game_options for select to anon, authenticated
  using (true);

-- Entries are private: owner only (staff not required for this step).
drop policy if exists "a prediction entry is visible to its owner" on public.hood_game_entries;
create policy "a prediction entry is visible to its owner"
  on public.hood_game_entries for select to authenticated
  using (public.owns_profile(profile_id));

-- ── 9. Privileges ───────────────────────────────────────────────────────────
revoke all on public.hood_games from public, anon, authenticated;
revoke all on public.hood_game_options from public, anon, authenticated;
revoke all on public.hood_game_entries from public, anon, authenticated;

grant select on public.hood_games to anon, authenticated;
grant select on public.hood_game_options to anon, authenticated;
grant select on public.hood_game_entries to authenticated;

grant execute on function public.create_prediction_game(public.hood_id, text, text[], timestamptz) to authenticated;
revoke execute on function public.create_prediction_game(public.hood_id, text, text[], timestamptz) from public, anon;

grant execute on function public.submit_prediction(text, text) to authenticated;
revoke execute on function public.submit_prediction(text, text) from public, anon;

grant execute on function public.resolve_prediction_game(text, text) to authenticated;
revoke execute on function public.resolve_prediction_game(text, text) from public, anon;

grant execute on function public.hood_game_view(text) to anon, authenticated;
grant execute on function public.hood_active_prediction(public.hood_id) to anon, authenticated;
revoke execute on function public.hood_game_view(text) from public;
revoke execute on function public.hood_active_prediction(public.hood_id) from public;

revoke execute on function public.close_prediction_games(integer) from public, anon, authenticated;
grant execute on function public.close_prediction_games(integer) to service_role;

revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
grant execute on function public.run_maintenance(integer) to service_role;
