-- ============================================================================
-- CLASH 2.0 · Phase 11 Step 2A — Comment & reply in-app notifications
-- ----------------------------------------------------------------------------
-- Completes the Arena engagement loop: successful comments write server-side
-- notifications using the existing `comment` / `reply` kinds.
--
-- Payload contract (matches app/(tabs)/notifications.tsx):
--   · entity_type = 'take'
--   · entity_id   = take id  (opens /take/{id}; no comment body stored)
--
-- Recipient matrix (see docs/PHASE_11_STEP_2A_COMMENT_REPLY_NOTIFICATIONS.md):
--   · Top-level comment → Take owner gets `comment` (never self).
--   · Nested reply → parent author gets `reply`; Take owner also gets `comment`
--     when they are a distinct eligible recipient (Vault community convention).
--   · Either-direction block skips that recipient (same as new_follower).
--
-- Atomic with insert: AFTER INSERT trigger in the same transaction as
-- create_comment. Deterministic ids + ON CONFLICT DO NOTHING avoid duplicates.
-- Clients still cannot INSERT into notifications.
-- ============================================================================

-- ── 1. Server-only helper ───────────────────────────────────────────────────
create or replace function public.arena_comment_notify(
  p_id          text,
  p_recipient   text,
  p_actor       text,
  p_kind        public.notification_kind,
  p_take_id     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_actor is null or p_take_id is null then
    return;
  end if;
  if p_recipient = p_actor then
    return;
  end if;
  if p_kind not in ('comment'::public.notification_kind, 'reply'::public.notification_kind) then
    raise exception 'arena_comment_notify: unsupported kind' using errcode = 'P0003';
  end if;
  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = p_recipient and b.blocked_id = p_actor)
        or (b.blocker_id = p_actor and b.blocked_id = p_recipient)
  ) then
    return;
  end if;

  insert into public.notifications (id, recipient_id, actor_id, kind, entity_type, entity_id)
  values (p_id, p_recipient, p_actor, p_kind, 'take', p_take_id)
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.arena_comment_notify(text, text, text, public.notification_kind, text)
  from public, anon, authenticated;
grant execute on function public.arena_comment_notify(text, text, text, public.notification_kind, text)
  to service_role;

-- ── 2. AFTER INSERT writer ──────────────────────────────────────────────────
create or replace function public.notify_arena_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_take_author   text;
  v_parent_author text;
begin
  select t.author_id into v_take_author
    from public.takes t
   where t.id = new.take_id;

  if new.parent_comment_id is null then
    -- Top-level rebuttal on a Take.
    perform public.arena_comment_notify(
      'comment_' || new.id,
      v_take_author,
      new.author_id,
      'comment'::public.notification_kind,
      new.take_id
    );
    return new;
  end if;

  select c.author_id into v_parent_author
    from public.comments c
   where c.id = new.parent_comment_id;

  -- Nested reply → parent author (`reply`).
  perform public.arena_comment_notify(
    'reply_' || new.id,
    v_parent_author,
    new.author_id,
    'reply'::public.notification_kind,
    new.take_id
  );

  -- Distinct Take owner also gets a Take-level `comment` (not a duplicate
  -- `reply` to the same person).
  if v_take_author is not null
     and v_take_author is distinct from v_parent_author
  then
    perform public.arena_comment_notify(
      'comment_' || new.id,
      v_take_author,
      new.author_id,
      'comment'::public.notification_kind,
      new.take_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists comments_notify_arena on public.comments;
create trigger comments_notify_arena
  after insert on public.comments
  for each row execute function public.notify_arena_comment();

revoke all on function public.notify_arena_comment() from public, anon, authenticated;

comment on function public.notify_arena_comment() is
  'Phase 11 Step 2A: writes comment/reply notifications after a successful comments insert.';
