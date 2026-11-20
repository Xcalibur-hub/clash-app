-- ============================================================================
-- CLASH cloud wrapper — step 115 of 119
-- version           : 20261111120000
-- ledger name       : beta_take_identity
-- mode              : direct
-- executed source   : supabase/migrations/20261111120000_beta_take_identity.sql
-- executed sha256   : 50fa500f84fb40eaca0af7274c29c4abd3189ca7ea0403e746c7c803acbc36ad
-- normalisation     : strip-begin-commit
-- normalized sha256 : b50ade0b8d150d4a804ecc2b62b24e85a2b2370bea0f244b726025b241dca6c0
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

-- A pending offer binds its proposition until expiry; an accepted competition
-- binds it permanently because legacy and canonical history read takes.text.
create function public.guard_beta_take_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (to_jsonb(new)-array['status','expires_at','reactions_count','clashes_count','heat','is_runtime_fixture'])
    is distinct from
     (to_jsonb(old)-array['status','expires_at','reactions_count','clashes_count','heat','is_runtime_fixture'])
    and (exists(select 1 from public.arena_challenges ch where ch.take_id=old.id
      and (ch.status='ACCEPTED' or (ch.status='PENDING' and ch.expires_at>clock_timestamp())))
      or exists(select 1 from public.clashes c where c.take_id=old.id)) then
    raise exception 'challenged debate identity is immutable' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.guard_beta_take_identity() from public,anon,authenticated,service_role;
create trigger beta_take_identity before update on public.takes
  for each row execute function public.guard_beta_take_identity();

-- The caller already takes the parent lock. Stamp its row version as well:
-- an older REPEATABLE READ snapshot must serialize-fail rather than miss a
-- newly committed offer/competition. No identity/counter/content is rewritten.
create function public.bind_beta_take_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.takes set id=id where id=new.take_id;
  return new;
end $$;
revoke all on function public.bind_beta_take_identity() from public,anon,authenticated,service_role;
create trigger a_beta_bind_take before insert on public.arena_challenges
  for each row execute function public.bind_beta_take_identity();
create trigger a_beta_bind_take before insert on public.clashes
  for each row execute function public.bind_beta_take_identity();


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261111120000',
  'beta_take_identity',
  array['sha256:b50ade0b8d150d4a804ecc2b62b24e85a2b2370bea0f244b726025b241dca6c0'],
  'clash-cloud-wrapper-v1'
);

commit;
