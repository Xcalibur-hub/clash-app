-- Commit the moderation target label before the following migration uses it.
alter type public.report_target add value if not exists 'arena_private_assist';
