-- Enum additions must commit before the lifecycle migration uses them.
alter type public.notification_kind add value if not exists 'challenge_received';
alter type public.notification_kind add value if not exists 'challenge_accepted';
