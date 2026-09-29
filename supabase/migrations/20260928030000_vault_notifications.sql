-- ============================================================================
-- CLASH 2.0 · 0017 — Vault notifications (server-written only)
-- ----------------------------------------------------------------------------
-- Two events matter for the Vault's first pass (§18): a new subscriber joins a
-- creator, and a subscriber-only Drop goes live. Both write through one
-- SECURITY DEFINER helper, so there is no client insert path anywhere:
-- `notifications` still has no INSERT grant (migration 0003) and only
-- `read_at` is client-writable.
-- ============================================================================

-- ── 1. Vocabulary ───────────────────────────────────────────────────────────
-- `notifications.entity_type` reuses `public.report_target`, so a Vault Drop and
-- a subscription have to be nameable there. Widening an enum is backward
-- compatible, and both labels are legitimate moderation targets later — a Drop
-- is reportable content.
alter type public.report_target add value if not exists 'vault_drop';
alter type public.report_target add value if not exists 'vault_subscription';

-- ── 2. Server-only notification helper ──────────────────────────────────────
create or replace function public.vault_notify(
  p_recipient   text,
  p_actor       text,
  p_kind        public.notification_kind,
  p_entity_type public.report_target,
  p_entity_id   text
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
    p_recipient, p_actor, p_kind, p_entity_type, p_entity_id
  );
end;
$$;

-- ── 3. "A subscriber Drop just went live" ───────────────────────────────────
-- Fanned out to live subscribers only, and bounded: one publish can never enqueue
-- an unbounded insert. A blocked pair is skipped, exactly like a follow.
create or replace function public.notify_vault_drop_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub record;
begin
  -- Only a subscriber-only Drop, and only while it is live.
  if new.access_level <> 'subscriber' or new.status <> 'published' then
    return new;
  end if;
  -- Announce exactly once: on the transition into "a subscriber drop is live".
  if tg_op = 'UPDATE' and old.access_level = 'subscriber' and old.status = 'published' then
    return new;
  end if;

  for v_sub in
    select s.subscriber_id
      from public.vault_subscriptions s
     where s.vault_id = new.vault_id
       and s.status in ('active', 'trial')
       and s.current_period_end > now()
       and not exists (
         select 1 from public.blocks b
          where (b.blocker_id = s.subscriber_id and b.blocked_id = new.creator_id)
             or (b.blocker_id = new.creator_id and b.blocked_id = s.subscriber_id)
       )
     order by s.started_at
     limit 500
  loop
    perform public.vault_notify(
      v_sub.subscriber_id, new.creator_id, 'vault_drop', 'vault_drop', new.id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists vault_drops_notify_subscribers on public.vault_drops;
create trigger vault_drops_notify_subscribers
  after insert or update on public.vault_drops
  for each row execute function public.notify_vault_drop_published();

-- ── 4. "Someone subscribed to you" ──────────────────────────────────────────
-- The subscriber's own profile is the actor, so Activity can render a face. The
-- entitlement row itself stays unreadable to the creator, and the entity is the
-- Vault (not the subscription id), so nothing leaks.
create or replace function public.notify_vault_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text;
begin
  -- Once per subscription, not once per renewal.
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;
  if new.status not in ('active', 'trial') then
    return new;
  end if;

  select creator_id into v_creator from public.creator_vaults where id = new.vault_id;
  if v_creator is null or v_creator = new.subscriber_id then
    return new;
  end if;

  perform public.vault_notify(
    v_creator, new.subscriber_id, 'vault_subscription', 'vault_subscription', new.vault_id
  );
  return new;
end;
$$;

drop trigger if exists vault_subscriptions_notify_creator on public.vault_subscriptions;
create trigger vault_subscriptions_notify_creator
  after insert or update on public.vault_subscriptions
  for each row execute function public.notify_vault_subscription();

-- ── 5. Privileges: internal to the triggers above ───────────────────────────
revoke execute on function public.vault_notify(text, text, public.notification_kind, public.report_target, text) from public, anon, authenticated;
revoke execute on function public.notify_vault_drop_published() from public, anon, authenticated;
revoke execute on function public.notify_vault_subscription() from public, anon, authenticated;
