-- ============================================================================
-- Arena Crews · Phase A enums
-- Separate transaction: Postgres cannot use newly added enum labels in the
-- same transaction that adds them.
-- ============================================================================

do $$ begin
  create type public.arena_crew_join_mode as enum ('OPEN', 'REQUEST', 'INVITE_ONLY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_crew_member_role as enum ('OWNER', 'MODERATOR', 'MEMBER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_crew_invite_status as enum
    ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.arena_crew_request_status as enum
    ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');
exception when duplicate_object then null; end $$;

alter type public.notification_kind add value if not exists 'arena_crew_invite';
alter type public.notification_kind add value if not exists 'arena_crew_join_request';
alter type public.notification_kind add value if not exists 'arena_crew_join_accepted';
alter type public.notification_kind add value if not exists 'arena_crew_join_declined';

alter type public.report_target add value if not exists 'arena_crew';
alter type public.report_target add value if not exists 'arena_crew_invite';
alter type public.report_target add value if not exists 'arena_crew_join_request';
