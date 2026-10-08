-- Supports the bounded recent candidate pool without sorting all active Takes.
create index arena_interest_feed_candidates_idx on public.takes(created_at desc,id desc)
 where status='active' and not is_runtime_fixture;
