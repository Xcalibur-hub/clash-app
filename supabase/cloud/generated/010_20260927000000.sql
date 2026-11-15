-- ============================================================================
-- CLASH cloud wrapper — step 10 of 111
-- version           : 20260927000000
-- ledger name       : feed_visibility
-- mode              : direct
-- executed source   : supabase/migrations/20260927000000_feed_visibility.sql
-- executed sha256   : 57285606475d5d1e7f87da4e2d399fe1c7b18ad8f157089c7150c6ed272f61a8
-- normalisation     : none
-- normalized sha256 : 57285606475d5d1e7f87da4e2d399fe1c7b18ad8f157089c7150c6ed272f61a8
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- If this file fails, neither the schema change nor the ledger row survives.
-- ============================================================================
begin;

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


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20260927000000',
  'feed_visibility',
  array['sha256:57285606475d5d1e7f87da4e2d399fe1c7b18ad8f157089c7150c6ed272f61a8'],
  'clash-cloud-wrapper-v1'
)
on conflict (version) do nothing;

commit;
