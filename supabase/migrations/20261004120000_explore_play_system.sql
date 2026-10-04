-- ============================================================================
-- Phase 14.1 â€” Challenges + Treasure Hunts + Hidden Gifts
-- Server-authoritative gameplay. Answers/rewards never client-trusted.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- â”€â”€ Enums â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
do $$ begin
  create type public.explore_entry_status as enum ('visible', 'hidden', 'removed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.explore_treasure_type as enum ('GLOBAL', 'COUNTRY', 'CREATOR');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.explore_clue_type as enum ('TEXT_ANSWER', 'CONTENT_FIND', 'MULTIPLE_CHOICE');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.explore_content_target as enum ('take', 'vault_drop', 'challenge', 'creator');
exception when duplicate_object then null;
end $$;

alter type public.notification_kind add value if not exists 'challenge_result';
alter type public.notification_kind add value if not exists 'challenge_reaction';
alter type public.notification_kind add value if not exists 'treasure_complete';
alter type public.notification_kind add value if not exists 'treasure_reward';

-- â”€â”€ Challenge participants / entries / reactions / results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create table if not exists public.explore_challenge_participants (
  challenge_id text not null references public.explore_challenges (id) on delete cascade,
  profile_id   text not null references public.profiles (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (challenge_id, profile_id)
);

create table if not exists public.explore_challenge_entries (
  id              text primary key default public.new_arena_id('ece_'),
  challenge_id    text not null references public.explore_challenges (id) on delete cascade,
  profile_id      text not null references public.profiles (id) on delete cascade,
  media_object_id text not null references public.media_objects (id),
  caption         text check (caption is null or char_length(caption) <= 280),
  status          public.explore_entry_status not null default 'visible',
  reactions_count integer not null default 0 check (reactions_count >= 0),
  created_at      timestamptz not null default now(),
  unique (challenge_id, profile_id)
);

create index if not exists explore_challenge_entries_feed_idx
  on public.explore_challenge_entries (challenge_id, status, reactions_count desc, created_at desc);

create table if not exists public.explore_challenge_entry_reactions (
  entry_id   text not null references public.explore_challenge_entries (id) on delete cascade,
  profile_id text not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, profile_id)
);

create table if not exists public.explore_challenge_results (
  challenge_id      text primary key references public.explore_challenges (id) on delete cascade,
  winner_entry_id   text references public.explore_challenge_entries (id) on delete set null,
  winner_profile_id text references public.profiles (id) on delete set null,
  settled_at        timestamptz not null default now(),
  metrics           jsonb not null default '{}'::jsonb
);

-- Reward metadata on challenges (optional)
alter table public.explore_challenges
  add column if not exists reward_type public.explore_reward_type,
  add column if not exists reward_metadata jsonb not null default '{}'::jsonb;

-- â”€â”€ Treasure extensions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
alter table public.explore_treasure_hunts
  add column if not exists hunt_type public.explore_treasure_type not null default 'GLOBAL',
  add column if not exists clue_count integer not null default 0 check (clue_count >= 0);

-- null gifts_remaining = unlimited inventory
alter table public.explore_treasure_hunts
  alter column gifts_remaining drop not null;

alter table public.explore_treasure_hunts
  drop constraint if exists explore_treasure_hunts_gifts_remaining_check;

alter table public.explore_treasure_hunts
  add constraint explore_treasure_hunts_gifts_remaining_check
  check (gifts_remaining is null or gifts_remaining >= 0);

create table if not exists public.explore_treasure_clues (
  id                   text primary key default public.new_arena_id('tcl_'),
  hunt_id              text not null references public.explore_treasure_hunts (id) on delete cascade,
  sort_order           integer not null check (sort_order >= 1),
  clue_type            public.explore_clue_type not null,
  prompt               text not null check (char_length(btrim(prompt)) between 1 and 500),
  choices              jsonb not null default '[]'::jsonb,
  -- Server-only digest. Never selected into client payloads.
  answer_digest        text,
  content_target_kind  public.explore_content_target,
  content_target_id    text,
  created_at           timestamptz not null default now(),
  unique (hunt_id, sort_order),
  constraint explore_treasure_clue_answer check (
    (clue_type in ('TEXT_ANSWER', 'MULTIPLE_CHOICE') and answer_digest is not null)
    or (clue_type = 'CONTENT_FIND' and content_target_kind is not null and content_target_id is not null)
  )
);

create table if not exists public.explore_treasure_clue_progress (
  hunt_id    text not null references public.explore_treasure_hunts (id) on delete cascade,
  profile_id text not null references public.profiles (id) on delete cascade,
  clue_id    text not null references public.explore_treasure_clues (id) on delete cascade,
  solved_at  timestamptz not null default now(),
  primary key (hunt_id, profile_id, clue_id)
);

create table if not exists public.explore_treasure_reward_claims (
  hunt_id         text not null references public.explore_treasure_hunts (id) on delete cascade,
  profile_id      text not null references public.profiles (id) on delete cascade,
  reward_type     public.explore_reward_type not null,
  reward_metadata jsonb not null default '{}'::jsonb,
  claimed_at      timestamptz not null default now(),
  primary key (hunt_id, profile_id)
);

-- Progress: allow join with progress 0
alter table public.explore_treasure_progress
  drop constraint if exists explore_treasure_progress_complete;

alter table public.explore_treasure_progress
  add constraint explore_treasure_progress_complete check (
    (completed_at is null) or (completed_at is not null and progress >= 0)
  );

-- â”€â”€ RLS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
alter table public.explore_challenge_participants enable row level security;
alter table public.explore_challenge_entries enable row level security;
alter table public.explore_challenge_entry_reactions enable row level security;
alter table public.explore_challenge_results enable row level security;
alter table public.explore_treasure_clues enable row level security;
alter table public.explore_treasure_clue_progress enable row level security;
alter table public.explore_treasure_reward_claims enable row level security;

create policy "challenge participants readable"
  on public.explore_challenge_participants for select to authenticated
  using (public.owns_profile(profile_id) or public.is_staff());

create policy "challenge entries publicly readable when visible"
  on public.explore_challenge_entries for select to anon, authenticated
  using (status = 'visible');

create policy "challenge entry reactions own"
  on public.explore_challenge_entry_reactions for select to authenticated
  using (public.owns_profile(profile_id));

create policy "challenge results publicly readable"
  on public.explore_challenge_results for select to anon, authenticated
  using (true);

-- Clues: public prompt only via RPC â€” deny direct select of answer_digest rows to clients.
-- We grant select but RPCs never expose answer_digest; still revoke broad select of digest
-- by denying table select and serving through security definer RPCs only.
revoke all on table public.explore_treasure_clues from public, anon, authenticated;
revoke all on table public.explore_treasure_clue_progress from public, anon, authenticated;
revoke all on table public.explore_treasure_reward_claims from public, anon, authenticated;
revoke all on table public.explore_challenge_participants from public, anon, authenticated;
revoke all on table public.explore_challenge_entries from public, anon, authenticated;
revoke all on table public.explore_challenge_entry_reactions from public, anon, authenticated;
revoke all on table public.explore_challenge_results from public, anon, authenticated;

grant select on table public.explore_challenge_entries to anon, authenticated;
grant select on table public.explore_challenge_entry_reactions to authenticated;
grant select on table public.explore_challenge_results to anon, authenticated;
grant select on table public.explore_challenge_participants to authenticated;
grant select on table public.explore_treasure_clue_progress to authenticated;
grant select on table public.explore_treasure_reward_claims to authenticated;
-- No grant on explore_treasure_clues â€” RPC only.

-- â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.explore_answer_digest(p_clue_id text, p_answer text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(lower(btrim(coalesce(p_answer, ''))) || '|' || coalesce(p_clue_id, ''), 'utf8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke execute on function public.explore_answer_digest(text, text) from public, anon, authenticated;
grant execute on function public.explore_answer_digest(text, text) to service_role;

create or replace function public.sync_challenge_entry_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.explore_challenge_entries
       set reactions_count = reactions_count + 1
     where id = new.entry_id;
  else
    update public.explore_challenge_entries
       set reactions_count = greatest(reactions_count - 1, 0)
     where id = old.entry_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_challenge_entry_reactions on public.explore_challenge_entry_reactions;
create trigger trg_sync_challenge_entry_reactions
  after insert or delete on public.explore_challenge_entry_reactions
  for each row execute function public.sync_challenge_entry_reactions();

create or replace function public.play_notify(
  p_recipient text,
  p_actor text,
  p_kind public.notification_kind,
  p_target_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  if public.explore_actor_hidden(p_recipient, p_actor) then
    return;
  end if;
  insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
  values (
    'n_' || substr(md5(p_recipient || coalesce(p_actor, '') || p_kind::text || coalesce(p_target_id, '') || clock_timestamp()::text), 1, 22),
    p_recipient, p_actor, p_kind, 'profile', p_target_id
  )
  on conflict do nothing;
exception when others then
  null;
end;
$$;

revoke execute on function public.play_notify(text, text, public.notification_kind, text) from public, anon, authenticated;

-- â”€â”€ Challenge RPCs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.join_challenge(p_challenge_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_ch public.explore_challenges%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to join' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'challenge_join', 30, interval '1 hour');

  select * into v_ch from public.explore_challenges where id = p_challenge_id;
  if v_ch.id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;
  if v_ch.visibility <> 'public' or v_ch.status <> 'active' or v_ch.ends_at <= now() then
    raise exception 'challenge not open' using errcode = 'P0003';
  end if;

  insert into public.explore_challenge_participants (challenge_id, profile_id)
  values (p_challenge_id, v_user)
  on conflict do nothing;

  return jsonb_build_object('joined', true, 'challengeId', p_challenge_id);
end;
$$;

revoke execute on function public.join_challenge(text) from public;
grant execute on function public.join_challenge(text) to authenticated;

create or replace function public.submit_challenge_entry(
  p_challenge_id text,
  p_media_object_id text,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_ch public.explore_challenges%rowtype;
  v_media public.media_objects%rowtype;
  v_entry public.explore_challenge_entries%rowtype;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
begin
  if v_user is null then
    raise exception 'sign in to submit' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_user, 'challenge_submit', 10, interval '1 hour');

  select * into v_ch from public.explore_challenges where id = p_challenge_id for update;
  if v_ch.id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;
  if v_ch.status <> 'active' or v_ch.ends_at <= now() or v_ch.visibility <> 'public' then
    raise exception 'challenge closed' using errcode = 'P0003';
  end if;

  select * into v_media from public.media_objects where id = p_media_object_id;
  if v_media.id is null or v_media.owner_id <> v_user then
    raise exception 'invalid media' using errcode = 'P0004';
  end if;
  if v_media.status <> 'ready' or v_media.visibility <> 'public' or v_media.bucket <> 'public-media' then
    raise exception 'media must be public and ready' using errcode = 'P0004';
  end if;

  insert into public.explore_challenge_participants (challenge_id, profile_id)
  values (p_challenge_id, v_user)
  on conflict do nothing;

  if exists (
    select 1 from public.explore_challenge_entries e
     where e.challenge_id = p_challenge_id and e.profile_id = v_user
  ) then
    raise exception 'already submitted' using errcode = 'P0006';
  end if;

  insert into public.explore_challenge_entries
    (challenge_id, profile_id, media_object_id, caption)
  values (p_challenge_id, v_user, p_media_object_id, v_caption)
  returning * into v_entry;

  update public.explore_challenges
     set entry_count = (
       select count(*)::integer from public.explore_challenge_entries e
        where e.challenge_id = p_challenge_id and e.status = 'visible'
     )
   where id = p_challenge_id;

  if v_ch.creator_id is not null then
    perform public.play_notify(v_ch.creator_id, v_user, 'challenge_reaction', v_entry.id);
  end if;

  return jsonb_build_object(
    'entryId', v_entry.id,
    'challengeId', p_challenge_id,
    'createdAt', v_entry.created_at
  );
end;
$$;

revoke execute on function public.submit_challenge_entry(text, text, text) from public;
grant execute on function public.submit_challenge_entry(text, text, text) to authenticated;

create or replace function public.toggle_challenge_entry_reaction(p_entry_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user text := public.my_profile_id();
  v_entry public.explore_challenge_entries%rowtype;
  v_ch public.explore_challenges%rowtype;
  v_removed integer;
  v_reacted boolean;
begin
  if v_user is null then
    raise exception 'sign in to react' using errcode = '42501';
  end if;

  select * into v_entry from public.explore_challenge_entries where id = p_entry_id;
  if v_entry.id is null or v_entry.status <> 'visible' then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
  if v_entry.profile_id = v_user then
    raise exception 'cannot react to own entry' using errcode = 'P0005';
  end if;
  if public.explore_actor_hidden(v_user, v_entry.profile_id) then
    raise exception 'blocked' using errcode = 'P0005';
  end if;

  select * into v_ch from public.explore_challenges where id = v_entry.challenge_id;
  if v_ch.id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  perform public.assert_rate_limit(v_user, 'challenge_react', 120, interval '10 minutes');

  delete from public.explore_challenge_entry_reactions
   where entry_id = p_entry_id and profile_id = v_user;
  get diagnostics v_removed = row_count;
  v_reacted := (v_removed = 0);
  if v_reacted then
    insert into public.explore_challenge_entry_reactions (entry_id, profile_id)
    values (p_entry_id, v_user);
    perform public.play_notify(v_entry.profile_id, v_user, 'challenge_reaction', p_entry_id);
  end if;

  select reactions_count into v_entry.reactions_count
    from public.explore_challenge_entries where id = p_entry_id;

  return jsonb_build_object(
    'entryId', p_entry_id,
    'reacted', v_reacted,
    'reactionsCount', v_entry.reactions_count
  );
end;
$$;

revoke execute on function public.toggle_challenge_entry_reaction(text) from public;
grant execute on function public.toggle_challenge_entry_reaction(text) to authenticated;

create or replace function public.settle_challenge(p_challenge_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch public.explore_challenges%rowtype;
  v_existing public.explore_challenge_results%rowtype;
  v_winner public.explore_challenge_entries%rowtype;
begin
  select * into v_ch from public.explore_challenges where id = p_challenge_id for update;
  if v_ch.id is null then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  select * into v_existing from public.explore_challenge_results where challenge_id = p_challenge_id;
  if v_existing.challenge_id is not null then
    return jsonb_build_object(
      'challengeId', p_challenge_id,
      'winnerEntryId', v_existing.winner_entry_id,
      'winnerProfileId', v_existing.winner_profile_id,
      'settledAt', v_existing.settled_at,
      'alreadySettled', true
    );
  end if;

  if v_ch.ends_at > now() and v_ch.status = 'active' then
    raise exception 'challenge still active' using errcode = 'P0003';
  end if;

  update public.explore_challenges
     set status = 'ended'
   where id = p_challenge_id and status = 'active';

  select * into v_winner
    from public.explore_challenge_entries e
   where e.challenge_id = p_challenge_id
     and e.status = 'visible'
   order by e.reactions_count desc, e.created_at asc
   limit 1;

  insert into public.explore_challenge_results
    (challenge_id, winner_entry_id, winner_profile_id, metrics)
  values (
    p_challenge_id,
    v_winner.id,
    v_winner.profile_id,
    jsonb_build_object(
      'reactions', coalesce(v_winner.reactions_count, 0),
      'entryCount', v_ch.entry_count
    )
  );

  if v_winner.profile_id is not null then
    perform public.play_notify(v_winner.profile_id, null, 'challenge_result', p_challenge_id);
  end if;

  return jsonb_build_object(
    'challengeId', p_challenge_id,
    'winnerEntryId', v_winner.id,
    'winnerProfileId', v_winner.profile_id,
    'alreadySettled', false
  );
end;
$$;

revoke execute on function public.settle_challenge(text) from public;
grant execute on function public.settle_challenge(text) to authenticated, service_role;

create or replace function public.get_challenge_detail(p_challenge_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_ch public.explore_challenges%rowtype;
  v_host public.profiles%rowtype;
  v_result public.explore_challenge_results%rowtype;
  v_joined boolean := false;
  v_my_entry text;
begin
  select * into v_ch from public.explore_challenges where id = p_challenge_id;
  if v_ch.id is null or v_ch.visibility <> 'public' then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  if v_ch.ends_at <= now() and v_ch.status = 'active' then
    -- Lazy settle for readers.
    perform public.settle_challenge(p_challenge_id);
    select * into v_ch from public.explore_challenges where id = p_challenge_id;
  end if;

  select * into v_host from public.profiles where id = v_ch.creator_id;
  select * into v_result from public.explore_challenge_results where challenge_id = p_challenge_id;

  if v_viewer is not null then
    v_joined := exists (
      select 1 from public.explore_challenge_participants p
       where p.challenge_id = p_challenge_id and p.profile_id = v_viewer
    );
    select e.id into v_my_entry
      from public.explore_challenge_entries e
     where e.challenge_id = p_challenge_id and e.profile_id = v_viewer
     limit 1;
  end if;

  return jsonb_build_object(
    'id', v_ch.id,
    'title', v_ch.title,
    'description', v_ch.description,
    'challengeType', v_ch.challenge_type,
    'countryCode', v_ch.country_code,
    'status', v_ch.status,
    'coverUrl', v_ch.cover_url,
    'entryCount', v_ch.entry_count,
    'startsAt', v_ch.starts_at,
    'endsAt', v_ch.ends_at,
    'rewardType', v_ch.reward_type,
    'host', case when v_host.id is null then null else jsonb_build_object(
      'id', v_host.id, 'handle', v_host.handle, 'name', v_host.name, 'avatarTint', v_host.avatar_tint
    ) end,
    'joined', v_joined,
    'myEntryId', v_my_entry,
    'result', case when v_result.challenge_id is null then null else jsonb_build_object(
      'winnerEntryId', v_result.winner_entry_id,
      'winnerProfileId', v_result.winner_profile_id,
      'settledAt', v_result.settled_at,
      'metrics', v_result.metrics
    ) end
  );
end;
$$;

revoke execute on function public.get_challenge_detail(text) from public;
grant execute on function public.get_challenge_detail(text) to anon, authenticated;

create or replace function public.list_challenge_entries(
  p_challenge_id text,
  p_sort text default 'trending',
  p_limit integer default 24,
  p_cursor integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 40));
  v_offset integer := greatest(0, coalesce(p_cursor, 0));
begin
  return (
    with ranked as (
      select
        e.id,
        e.challenge_id,
        e.profile_id,
        e.caption,
        e.reactions_count,
        e.created_at,
        m.storage_path,
        m.media_kind,
        p.handle,
        p.name,
        p.avatar_tint,
        exists (
          select 1 from public.explore_challenge_entry_reactions r
           where r.entry_id = e.id and r.profile_id = v_viewer
        ) as reacted,
        row_number() over (
          order by
            case when lower(coalesce(p_sort, 'trending')) = 'new' then e.created_at end desc nulls last,
            e.reactions_count desc,
            e.created_at desc
        ) as rn
      from public.explore_challenge_entries e
      join public.profiles p on p.id = e.profile_id
      join public.media_objects m on m.id = e.media_object_id
     where e.challenge_id = p_challenge_id
       and e.status = 'visible'
       and m.visibility = 'public'
       and m.status = 'ready'
       and not public.explore_actor_hidden(v_viewer, e.profile_id)
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', id,
                 'challengeId', challenge_id,
                 'caption', caption,
                 'reactionsCount', reactions_count,
                 'createdAt', created_at,
                 'mediaPath', storage_path,
                 'mediaKind', media_kind,
                 'reacted', reacted,
                 'author', jsonb_build_object(
                   'id', profile_id, 'handle', handle, 'name', name, 'avatarTint', avatar_tint
                 )
               ) order by rn)
          from ranked
         where rn > v_offset and rn <= v_offset + v_limit
      ), '[]'::jsonb),
      'nextCursor', case
        when (select count(*) from ranked) > v_offset + v_limit then v_offset + v_limit
        else null
      end
    )
  );
end;
$$;

revoke execute on function public.list_challenge_entries(text, text, integer, integer) from public;
grant execute on function public.list_challenge_entries(text, text, integer, integer) to anon, authenticated;

create or replace function public.list_play_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
begin
  return jsonb_build_object(
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'title', c.title,
               'description', c.description,
               'challengeType', c.challenge_type,
               'countryCode', c.country_code,
               'status', c.status,
               'coverUrl', c.cover_url,
               'entryCount', c.entry_count,
               'endsAt', c.ends_at,
               'joined', exists (
                 select 1 from public.explore_challenge_participants p
                  where p.challenge_id = c.id and p.profile_id = v_viewer
               )
             ) order by c.ends_at asc)
        from (
          select c.* from public.explore_challenges c
           where c.visibility = 'public'
             and c.status in ('active', 'ended')
             and c.ends_at > now() - interval '7 days'
           order by
             case when c.status = 'active' then 0 else 1 end,
             c.ends_at asc
           limit 40
        ) c
    ), '[]'::jsonb),
    'treasures', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'title', t.title,
               'description', t.description,
               'huntType', t.hunt_type,
               'countryCode', t.country_code,
               'status', t.status,
               'coverUrl', t.cover_url,
               'clue', t.clue,
               'clueCount', t.clue_count,
               'giftsRemaining', t.gifts_remaining,
               'endsAt', t.ends_at,
               'rewardType', t.reward_type,
               'progress', coalesce((
                 select p.progress from public.explore_treasure_progress p
                  where p.hunt_id = t.id and p.profile_id = v_viewer
               ), 0),
               'completed', exists (
                 select 1 from public.explore_treasure_progress p
                  where p.hunt_id = t.id and p.profile_id = v_viewer and p.completed_at is not null
               )
             ) order by t.ends_at asc)
        from (
          select t.* from public.explore_treasure_hunts t
           where t.visibility = 'public'
             and t.status in ('active', 'ended')
             and t.ends_at > now() - interval '7 days'
           order by
             case when t.status = 'active' then 0 else 1 end,
             t.ends_at asc
           limit 40
        ) t
    ), '[]'::jsonb),
    'generatedAt', now()
  );
end;
$$;

revoke execute on function public.list_play_home() from public;
grant execute on function public.list_play_home() to anon, authenticated;

