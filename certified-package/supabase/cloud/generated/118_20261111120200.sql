-- ============================================================================
-- CLASH cloud wrapper — step 118 of 119
-- version           : 20261111120200
-- ledger name       : beta_legacy_visibility
-- mode              : direct
-- executed source   : supabase/migrations/20261111120200_beta_legacy_visibility.sql
-- executed sha256   : 2ba4cf9d18e94e47c6ca686d3053f5b80420c9e7f47631d57f14935467dd6ccc
-- normalisation     : strip-begin-commit
-- normalized sha256 : f90b7197425a4e226926c9234620722d3ab8536b046d8682d271c6db6bb9efbd
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
--
-- CONCURRENCY (Round 8): the ledger insert has NO conflict clause. If a row for
-- this version already exists, the insert raises unique_violation, the whole
-- transaction aborts and no statement of the migration survives. An
-- 'on conflict do nothing' would have skipped the row while re-executing the
-- migration body - the one case the read-back could not detect.
-- ============================================================================
begin;

-- Keep the exact signature for old clients, but never create a consent-free
-- legacy competition. History/read RPCs and canonical invitation APIs survive.
create or replace function public.start_clash(
  p_take_id text, p_comment_id text default null,
  p_mode public.clash_mode default 'STANDARD'
) returns text language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Use canonical challenges and author acceptance' using errcode='42501';
end $$;
revoke all on function public.start_clash(text,text,public.clash_mode)
  from public,anon,authenticated,service_role;

-- Expiry is a feed/lifecycle property, not a newly invented privacy boundary.
-- Keep existing public historical reads and block/mute/removed-content rules.
-- There is no private-Take visibility column. A private-history product change
-- requires a separate decision and must not be inferred from a client gate.
create policy "runtime Takes are not client content" on public.takes
  as restrictive for select to anon,authenticated using (not is_runtime_fixture);
create or replace function public.arena_take_readable(p_take_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.takes t where t.id=p_take_id
    and t.status <> 'removed' and not t.is_runtime_fixture
    and not public.arena_actor_hidden_internal(public.my_profile_id(),t.author_id));
$$;


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261111120200',
  'beta_legacy_visibility',
  array['sha256:f90b7197425a4e226926c9234620722d3ab8536b046d8682d271c6db6bb9efbd'],
  'clash-cloud-wrapper-v1'
);

commit;
