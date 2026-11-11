begin;
-- Defense at implicit INSERT/UPSERT boundaries, including a concurrent revoke.
-- PostgREST's SET ROLE remains visible across SECURITY DEFINER calls. Ordinary
-- SQL roles cannot promote that setting to an owner/service role. Trusted direct
-- owner DDL/fixture loading remains outside this API boundary, as with BYPASSRLS.
create function public.guard_beta_membership_admission() returns trigger
language plpgsql security definer set search_path='' as $$
declare capability text;
begin
  if current_setting('role') not in ('anon','authenticated','service_role') then return new; end if;
  if tg_table_name='arena_crew_memberships' then
    capability:='groups';
    if tg_op='UPDATE' and old.left_at is not null and new.left_at is null then
      perform public.assert_release_admission(capability);
    end if;
    perform 1 from public.arena_crew_memberships where crew_id=new.crew_id
      and profile_id=new.profile_id and left_at is null for key share;
  elsif tg_table_name='arena_crew_follows' then
    capability:='groups';
    perform 1 from public.arena_crew_follows where crew_id=new.crew_id and profile_id=new.profile_id for key share;
  elsif tg_table_name='vault_community_memberships' then
    capability:='commerce';
    perform 1 from public.vault_community_memberships where community_id=new.community_id and profile_id=new.profile_id for key share;
  elsif tg_table_name='explore_challenge_participants' then
    capability:='play';
    perform 1 from public.explore_challenge_participants where challenge_id=new.challenge_id and profile_id=new.profile_id for key share;
  elsif tg_table_name='explore_treasure_progress' then
    capability:='play';
    perform 1 from public.explore_treasure_progress where hunt_id=new.hunt_id and profile_id=new.profile_id for key share;
  elsif tg_table_name='arena_room_participants' then
    if exists(select 1 from public.arena_rooms where id=new.room_id and clash_id is not null) then return new; end if;
    capability:='groups';
    perform 1 from public.arena_room_participants where room_id=new.room_id and profile_id=new.profile_id for key share;
  else
    raise exception 'Unknown admission write boundary' using errcode='42501';
  end if;
  if not found then perform public.assert_release_admission(capability); end if;
  return new;
end $$;
revoke all on function public.guard_beta_membership_admission() from public,anon,authenticated,service_role;
create trigger beta_membership_admission before insert or update of left_at on public.arena_crew_memberships
  for each row execute function public.guard_beta_membership_admission();
create trigger beta_membership_admission before insert on public.arena_crew_follows
  for each row execute function public.guard_beta_membership_admission();
create trigger beta_membership_admission before insert on public.vault_community_memberships
  for each row execute function public.guard_beta_membership_admission();
create trigger beta_membership_admission before insert on public.explore_challenge_participants
  for each row execute function public.guard_beta_membership_admission();
create trigger beta_membership_admission before insert on public.explore_treasure_progress
  for each row execute function public.guard_beta_membership_admission();
create trigger beta_membership_admission before insert on public.arena_room_participants
  for each row execute function public.guard_beta_membership_admission();
commit;
