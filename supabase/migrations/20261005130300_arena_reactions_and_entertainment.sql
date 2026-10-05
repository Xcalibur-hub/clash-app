-- ============================================================================
-- CLASH 2.0 · Phase 14.3 — Reaction vocabulary, entertainment credit, sweeps
-- ----------------------------------------------------------------------------
-- ENTERTAINMENT IS NOT ARGUMENT QUALITY.
--
-- Judgement lives in `arena_room_side_votes` / `arena_room_argument_votes` and
-- awards DEBATE reputation. Reactions live in `arena_room_message_reactions`,
-- are a crowd signal, and award ENTERTAINMENT — which grants NO authority over
-- arguments and is never read by `arena_standing_for()`.
--
-- The reaction vocabulary is a compact, server-side allowlist. A reaction is
-- NEVER a judgement vote: the two never share a table, a tally or an RPC.
-- ============================================================================

-- ── 1. The palette (one source of truth for RPC, tests and client) ──────────
create or replace function public.arena_reaction_vocabulary()
returns text[]
language sql
immutable
as $$
  select array['🔥', '🧢', '🧾', '💀', '🤯', '⚔', '🧠']::text[];
$$;

revoke execute on function public.arena_reaction_vocabulary() from public;
grant execute on function public.arena_reaction_vocabulary() to anon, authenticated, service_role;

comment on function public.arena_reaction_vocabulary() is
  'Compact Arena reaction palette: cooked, cap, receipts, bro, plot twist, called out, changed my mind.';

-- ── 2. react_arena_room_message — same rules, validated vocabulary ──────────
-- Everything that already protected this call is preserved in the same order
-- (sign-in, emoji shape, message existence, tombstone, membership, debater role,
-- room open, blocks, rate limit, toggle). The only change is that the emoji must
-- now be a member of the palette, so a client cannot inject arbitrary strings.
create or replace function public.react_arena_room_message(
  p_message_id text,
  p_emoji      text default '🔥'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    text := public.my_profile_id();
  v_emoji   text := coalesce(btrim(p_emoji), '');
  v_msg     public.arena_room_messages%rowtype;
  v_room    public.arena_rooms%rowtype;
  v_reacted boolean;
  v_count   integer;
begin
  if v_user is null then
    raise exception 'sign in to react' using errcode = '42501';
  end if;
  if v_emoji = '' or char_length(v_emoji) > 8 then
    raise exception 'pick a single reaction' using errcode = 'P0003';
  end if;
  if not (v_emoji = any (public.arena_reaction_vocabulary())) then
    raise exception 'pick a reaction from the room palette' using errcode = 'P0003';
  end if;

  select * into v_msg from public.arena_room_messages where id = p_message_id;
  if not found then
    raise exception 'argument does not exist' using errcode = 'P0002';
  end if;
  if v_msg.hidden_at is not null then
    raise exception 'argument is not available' using errcode = 'P0003';
  end if;
  if not public.arena_is_room_member(v_msg.room_id) then
    raise exception 'join the room to react' using errcode = '42501';
  end if;
  if not public.arena_is_room_debater(v_msg.room_id) then
    raise exception 'spectators cannot react' using errcode = '42501';
  end if;

  select * into v_room from public.arena_rooms where id = v_msg.room_id;
  if v_room.status in ('SETTLED', 'CANCELLED') then
    raise exception 'the room is closed' using errcode = 'P0003';
  end if;
  if public.arena_actor_hidden(v_user, v_msg.author_id) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  perform public.assert_rate_limit(v_user, 'arena_room_react', 60, interval '10 minutes');

  delete from public.arena_room_message_reactions
   where message_id = p_message_id and profile_id = v_user and emoji = v_emoji;

  if found then
    v_reacted := false;
  else
    insert into public.arena_room_message_reactions (message_id, profile_id, emoji)
    values (p_message_id, v_user, v_emoji);
    v_reacted := true;
  end if;

  select count(*)::integer into v_count
    from public.arena_room_message_reactions
   where message_id = p_message_id and emoji = v_emoji;

  return jsonb_build_object(
    'messageId', p_message_id,
    'emoji', v_emoji,
    'reacted', v_reacted,
    'count', v_count
  );
end;
$$;

revoke execute on function public.react_arena_room_message(text, text) from public, anon;
grant execute on function public.react_arena_room_message(text, text) to authenticated;

-- ── 3. The room's funniest moment (ENTERTAINMENT, never authority) ──────────
/**
 * Award the settled room's crowd moment.
 *
 * Deterministic, server-side, and idempotent per room: the winner is the most
 * reacted-to argument by OTHER people (self-reactions excluded), with a
 * threshold so a two-person room cannot mint the award. The credit lands on the
 * ENTERTAINMENT facet, which `arena_standing_for()` never reads — being funny
 * is a real form of value here, and it is not expertise.
 *
 * It does not touch side votes or best-argument: judgement stays the room's
 * verdict, this is just who made everyone laugh.
 */
create or replace function public.award_arena_fun_moment(p_room_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room   public.arena_rooms%rowtype;
  v_author text;
  v_count  integer := 0;
begin
  select * into v_room from public.arena_rooms where id = p_room_id;
  if not found or v_room.status <> 'SETTLED' then
    return false;
  end if;

  -- Once per room, ever.
  if exists (
    select 1 from public.reputation_events e
     where e.arena_room_id = p_room_id and e.kind = 'arena_crowd_favorite'
  ) then
    return false;
  end if;

  select m.author_id,
         (select count(*)::integer from public.arena_room_message_reactions rc
           where rc.message_id = m.id and rc.profile_id is distinct from m.author_id)
    into v_author, v_count
    from public.arena_room_messages m
   where m.room_id = p_room_id
     and m.hidden_at is null
     and m.kind <> 'system'
   order by
     (select count(*) from public.arena_room_message_reactions rc
       where rc.message_id = m.id and rc.profile_id is distinct from m.author_id) desc,
     m.created_at asc,
     m.id asc
   limit 1;

  if v_author is null or v_count < 5 then
    return false;
  end if;

  insert into public.reputation_events
    (id, profile_id, clash_id, arena_room_id, kind, reputation_delta, coins_delta)
  values (
    public.new_arena_id('re_'), v_author, null, p_room_id, 'arena_crowd_favorite', 12, 0
  );
  update public.profiles
     set reputation = reputation + 12,
         rank = public.rank_for_rep(reputation + 12)
   where id = v_author;

  return true;
end;
$$;

revoke execute on function public.award_arena_fun_moment(text) from public, anon, authenticated;
grant execute on function public.award_arena_fun_moment(text) to service_role;

comment on function public.award_arena_fun_moment(text) is
  'Settled-room crowd moment → ENTERTAINMENT facet. Idempotent. Never awards authority.';

/** Bounded sweep: award any settled room that has not had its moment yet. */
create or replace function public.award_arena_fun_moments(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_n     integer := 0;
  r       record;
begin
  for r in
    select rm.id
      from public.arena_rooms rm
     where rm.status = 'SETTLED'
       and not exists (
         select 1 from public.reputation_events e
          where e.arena_room_id = rm.id and e.kind = 'arena_crowd_favorite'
       )
     order by rm.closes_at desc, rm.id asc
     limit v_limit
  loop
    if public.award_arena_fun_moment(r.id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.award_arena_fun_moments(integer) from public, anon, authenticated;
grant execute on function public.award_arena_fun_moments(integer) to service_role;

-- ── 4. run_maintenance — every existing key preserved, two added ────────────
-- Latest prior definition is 20261004150000_meet_video.sql, which added
-- `meet_signals_pruned`. Both keys and both new Arena sweeps are kept.
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
  v_world   integer;
  v_arena   integer;
  v_signals integer;
  v_backups integer;
  v_moments integer;
begin
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

  return jsonb_build_object(
    'clashes_settled', v_clashes,
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
    'arena_fun_moments_awarded', v_moments
  );
end;
$$;

revoke execute on function public.run_maintenance(integer) from public, anon, authenticated;
grant execute on function public.run_maintenance(integer) to service_role;

