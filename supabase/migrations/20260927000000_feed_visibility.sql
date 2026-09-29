-- ============================================================================
-- CLASH 2.0 · 0010 — block/mute-aware Arena feed visibility
-- ----------------------------------------------------------------------------
-- Replaces the single public `takes` SELECT policy with two, so an authenticated
-- viewer's feed hides Takes whose author they have blocked, who has blocked
-- them, or whom they have muted — in *both* block directions, matching the
-- existing client-side safety semantics (fetchViewerSafetyState).
--
-- Guests (anon) still see the whole public Arena. Block/mute relationship rows
-- themselves stay private (their RLS is unchanged); only the filtered *result*
-- of reading takes changes. `my_profile_id()` is the caller-resolution helper
-- from migration 0003.
--
-- The client keeps its centralized `loadArena` filtering (defence-in-depth for
-- comments, which are filtered separately), but this policy makes block/mute
-- authoritative for every `takes` read — the For You / Following / Popular /
-- New / Hood feeds, search, popular Takes and profile Takes.
-- ============================================================================

drop policy if exists "takes are readable by everyone" on public.takes;

-- Guests: the Arena is a public feed.
create policy "takes are publicly readable"
  on public.takes for select to anon
  using (true);

-- Authenticated viewers: hide Takes from authors they've blocked (either
-- direction) or muted. Self-authored Takes are never hidden (no block to self).
create policy "takes are readable unless author is hidden"
  on public.takes for select to authenticated
  using (
    not exists (
      select 1 from public.blocks b
       where (b.blocker_id = takes.author_id and b.blocked_id = public.my_profile_id())
          or (b.blocker_id = public.my_profile_id() and b.blocked_id = takes.author_id)
    )
    and not exists (
      select 1 from public.mutes m
       where m.muter_id = public.my_profile_id()
         and m.muted_id = takes.author_id
    )
  );
