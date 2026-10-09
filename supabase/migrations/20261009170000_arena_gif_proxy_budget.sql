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
