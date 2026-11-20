-- Commit the enum value before the following migration uses it.
alter type public.report_target add value if not exists 'arena_crowd_message';
