-- ============================================================================
-- CLASH cloud wrapper — step 99 of 119
-- version           : 20261009170000
-- ledger name       : arena_gif_proxy_budget
-- mode              : direct
-- executed source   : supabase/migrations/20261009170000_arena_gif_proxy_budget.sql
-- executed sha256   : 6097e54b2062368e4861be1af89333479101f7c99bda51b94099d119336ee8e6
-- normalisation     : none
-- normalized sha256 : 6097e54b2062368e4861be1af89333479101f7c99bda51b94099d119336ee8e6
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

-- Only the authenticated Edge proxy may charge the fixed GIF request budgets.
create function public.claim_arena_gif_request(p_auth_uid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select id into actor from public.profiles where auth_user_id=p_auth_uid;
 if actor is null then raise exception 'Account unavailable' using errcode='42501'; end if;
 -- Global then actor lock ordering is consistent across all proxy requests.
 perform public.assert_rate_limit('arena-gif-proxy','gif_global',120,interval '1 minute');
 perform public.assert_rate_limit(actor,'gif_search',20,interval '1 minute');
end $$;
revoke all on function public.claim_arena_gif_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_arena_gif_request(uuid) to service_role;
notify pgrst,'reload schema';


insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '20261009170000',
  'arena_gif_proxy_budget',
  array['sha256:6097e54b2062368e4861be1af89333479101f7c99bda51b94099d119336ee8e6'],
  'clash-cloud-wrapper-v1'
);

commit;
