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
commit;
