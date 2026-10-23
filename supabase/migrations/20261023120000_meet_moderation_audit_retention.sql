-- ============================================================================
-- E3.2.8 — Moderation audit survives the moderator
-- ----------------------------------------------------------------------------
-- Defect closed: both staff audit trails keyed their actor with
--   `references public.profiles (id) on delete cascade`
-- (E3.2 §14 for `meet_moderation_reads`, social foundation for
-- `moderation_actions`). Deleting one moderator profile — account deletion,
-- staff offboarding, a mistaken cleanup — silently erased every transcript
-- read and every moderation action that moderator ever performed. That is the
-- exact evidence an abuse investigation needs *after* the actor is gone.
--
-- Retention model (database-enforced, not convention):
--   · `moderator_id` keeps the live link while the profile exists and becomes
--     NULL when the profile is deleted (`on delete set null`); it never
--     cascades.
--   · `moderator_ref` is an immutable pseudonymous snapshot of the actor,
--     stamped by a BEFORE INSERT trigger from `moderator_id`. A caller cannot
--     choose it, and a CHECK constraint binds it to the live id while that id
--     is present. After deletion the snapshot still correlates that
--     moderator's history but keeps no profile attribute — no handle, no name,
--     no auth user id, no free-text reason about the person.
--   · `moderator_ref` is SHA-256 over the opaque `profiles.id`, so it is not a
--     second copy of a profile: nothing about the person is recoverable from
--     the audit table alone, and the only rows that ever expose a preimage are
--     the profile rows staff can already read.
--   · A guard trigger makes the rows append-only: the *one* permitted UPDATE
--     is the anonymisation above, it is reachable only after the actor's
--     profile row is deleted, and DELETE/TRUNCATE require an owner-level role,
--     so a retention purge stays a deliberate operator action.
--   · `service_role` loses INSERT/UPDATE/DELETE/TRUNCATE on both audit tables.
--     The Data API key may read (staff RLS) but can no longer rewrite or erase
--     the trail it is supposed to be accountable to.
--
-- Nothing else changes: `session_id` stays FK-free (E3.2), RLS stays
-- staff-only, `authenticated` keeps exactly SELECT, and no RPC signature moves.
-- ============================================================================

-- ── 1. Pseudonymous actor snapshot ──────────────────────────────────────────
alter table public.meet_moderation_reads add column if not exists moderator_ref text;
alter table public.moderation_actions   add column if not exists moderator_ref text;

update public.meet_moderation_reads
   set moderator_ref = 'mod_' || pg_catalog.encode(
         pg_catalog.sha256(pg_catalog.convert_to(moderator_id, 'UTF8')), 'hex')
 where moderator_ref is null
   and moderator_id is not null;

update public.moderation_actions
   set moderator_ref = 'mod_' || pg_catalog.encode(
         pg_catalog.sha256(pg_catalog.convert_to(moderator_id, 'UTF8')), 'hex')
 where moderator_ref is null
   and moderator_id is not null;

alter table public.meet_moderation_reads alter column moderator_ref set not null;
alter table public.moderation_actions   alter column moderator_ref set not null;

create index if not exists meet_moderation_reads_actor_idx
  on public.meet_moderation_reads (moderator_ref, created_at desc);
create index if not exists moderation_actions_actor_idx
  on public.moderation_actions (moderator_ref, created_at desc);

-- ── 2. The actor link never deletes its own evidence ────────────────────────
alter table public.meet_moderation_reads
  drop constraint if exists meet_moderation_reads_moderator_id_fkey;
alter table public.meet_moderation_reads
  drop constraint if exists meet_moderation_reads_moderator_fk;
alter table public.meet_moderation_reads alter column moderator_id drop not null;
alter table public.meet_moderation_reads
  add constraint meet_moderation_reads_moderator_fk
  foreign key (moderator_id) references public.profiles (id) on delete set null;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_moderator_id_fkey;
alter table public.moderation_actions
  drop constraint if exists moderation_actions_moderator_fk;
alter table public.moderation_actions alter column moderator_id drop not null;
alter table public.moderation_actions
  add constraint moderation_actions_moderator_fk
  foreign key (moderator_id) references public.profiles (id) on delete set null;

-- ── 3. The snapshot is stamped, never supplied ──────────────────────────────
-- Shared by both audit tables: each uses the same `moderator_id` /
-- `moderator_ref` pair, so one trigger function cannot drift between them.
create or replace function public.stamp_moderation_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.moderator_id is null then
    raise exception 'moderation audit requires an actor' using errcode = '23502';
  end if;
  new.moderator_ref := 'mod_' || pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(new.moderator_id, 'UTF8')), 'hex');
  return new;
end;
$$;

revoke execute on function public.stamp_moderation_actor() from public, anon, authenticated;

-- ── 4. Append-only, except the one anonymisation the FK performs ────────────
-- Also shared: the permitted UPDATE is described table-agnostically — every
-- column except `moderator_id` must compare equal, `moderator_id` may only go
-- from a live actor to NULL, and only once that actor's profile is gone. While
-- the profile still exists the link *is* evidence, so nobody can pre-emptively
-- anonymise a trail by hand; the FK's ON DELETE SET NULL runs after the profile
-- row is deleted, which is why it is the one path that reaches NULL.
create or replace function public.guard_moderation_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.moderator_id is null or new.moderator_id is not null then
      raise exception 'moderation audit is append-only' using errcode = '42501';
    end if;
    if (select count(*) from public.profiles where id = old.moderator_id) > 0 then
      raise exception 'moderation audit is append-only' using errcode = '42501';
    end if;
    if (pg_catalog.to_jsonb(new) - 'moderator_id')
       is distinct from (pg_catalog.to_jsonb(old) - 'moderator_id') then
      raise exception 'moderation audit is append-only' using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE (row) and TRUNCATE (statement): retention purges are an operator
  -- action on the owner role, never something a client credential can do.
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'moderation audit is retained' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else null end;
end;
$$;

revoke execute on function public.guard_moderation_audit() from public, anon, authenticated;

-- ── 5. Snapshot integrity ──────────────────────────────────────────────────
-- Shape: a fixed prefix plus SHA-256 hex. Binding: while the profile exists the
-- snapshot must equal the hash of that profile id, so a stored row can never
-- claim an actor it was not stamped with. Once the profile is gone the snapshot
-- is the only remaining copy and is no longer recomputable — hence the NULL
-- branch, which is also the only state a deleted moderator can leave behind.
alter table public.meet_moderation_reads
  drop constraint if exists meet_moderation_reads_actor_ref_shape;
alter table public.meet_moderation_reads
  add constraint meet_moderation_reads_actor_ref_shape
  check (moderator_ref ~ '^mod_[0-9a-f]{64}$');

alter table public.meet_moderation_reads
  drop constraint if exists meet_moderation_reads_actor_ref_binding;
alter table public.meet_moderation_reads
  add constraint meet_moderation_reads_actor_ref_binding
  check (moderator_id is null
         or moderator_ref = 'mod_' || pg_catalog.encode(
              pg_catalog.sha256(pg_catalog.convert_to(moderator_id, 'UTF8')), 'hex'));

alter table public.moderation_actions
  drop constraint if exists moderation_actions_actor_ref_shape;
alter table public.moderation_actions
  add constraint moderation_actions_actor_ref_shape
  check (moderator_ref ~ '^mod_[0-9a-f]{64}$');

alter table public.moderation_actions
  drop constraint if exists moderation_actions_actor_ref_binding;
alter table public.moderation_actions
  add constraint moderation_actions_actor_ref_binding
  check (moderator_id is null
         or moderator_ref = 'mod_' || pg_catalog.encode(
              pg_catalog.sha256(pg_catalog.convert_to(moderator_id, 'UTF8')), 'hex'));

-- ── 6. Wire the triggers ────────────────────────────────────────────────────
drop trigger if exists meet_moderation_reads_stamp_actor on public.meet_moderation_reads;
create trigger meet_moderation_reads_stamp_actor
  before insert on public.meet_moderation_reads
  for each row execute function public.stamp_moderation_actor();

drop trigger if exists meet_moderation_reads_append_only on public.meet_moderation_reads;
create trigger meet_moderation_reads_append_only
  before update or delete on public.meet_moderation_reads
  for each row execute function public.guard_moderation_audit();

drop trigger if exists meet_moderation_reads_no_truncate on public.meet_moderation_reads;
create trigger meet_moderation_reads_no_truncate
  before truncate on public.meet_moderation_reads
  for each statement execute function public.guard_moderation_audit();

drop trigger if exists moderation_actions_stamp_actor on public.moderation_actions;
create trigger moderation_actions_stamp_actor
  before insert on public.moderation_actions
  for each row execute function public.stamp_moderation_actor();

drop trigger if exists moderation_actions_append_only on public.moderation_actions;
create trigger moderation_actions_append_only
  before update or delete on public.moderation_actions
  for each row execute function public.guard_moderation_audit();

drop trigger if exists moderation_actions_no_truncate on public.moderation_actions;
create trigger moderation_actions_no_truncate
  before truncate on public.moderation_actions
  for each statement execute function public.guard_moderation_audit();

-- ── 7. Data API privileges: read-only for every client role ─────────────────
-- `alter default privileges` in the initial schema handed new public tables
-- ALL to service_role, which included DELETE on these audit rows. Re-assert
-- the read grants explicitly so the intent sits next to the revoke.
revoke insert, update, delete, truncate, references, trigger
  on public.meet_moderation_reads from anon, authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger
  on public.moderation_actions from anon, authenticated, service_role;

grant select on table public.meet_moderation_reads to authenticated;
grant select on table public.moderation_actions to authenticated;

notify pgrst, 'reload schema';
