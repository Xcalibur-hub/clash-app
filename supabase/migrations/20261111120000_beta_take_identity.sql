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
commit;
