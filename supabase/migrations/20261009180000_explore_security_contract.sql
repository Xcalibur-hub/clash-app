-- Explore Phase 1A: caller-scoped projections and Play authorization.
-- Preserve historical public activities, legacy media URLs and existing reward mechanics.
create or replace function public.explore_country_activity_count(p_code text)
returns integer language sql stable security definer set search_path='' as $$
 select case when count(*)>=3 then count(*)::integer else null end
 from public.profiles where public_country_code=upper(btrim(p_code));
$$;
revoke all on function public.explore_country_activity_count(text) from public,anon,authenticated;
grant execute on function public.explore_country_activity_count(text) to anon,authenticated;

create function public.explore_public_media_ready(p_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_objects m where m.id=p_id
   and m.status='ready' and m.deleted_at is null and m.visibility='public' and m.bucket='public-media');
$$;
create function public.explore_challenge_readable(p_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.explore_challenges c where c.id=p_id
   and c.visibility='public' and c.status in ('scheduled','active','ended')
   and (c.creator_id is null or not public.explore_actor_hidden_internal(public.my_profile_id(),c.creator_id)));
$$;
create function public.explore_treasure_readable(p_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.explore_treasure_hunts t where t.id=p_id
   and t.visibility='public' and t.status in ('scheduled','active','ended')
   and (t.creator_id is null or not public.explore_actor_hidden_internal(public.my_profile_id(),t.creator_id)));
$$;
create function public.explore_entry_readable(p_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.explore_challenge_entries e where e.id=p_id
   and e.status='visible' and public.explore_challenge_readable(e.challenge_id)
   and public.explore_public_media_ready(e.media_object_id)
   and not public.explore_actor_hidden_internal(public.my_profile_id(),e.profile_id));
$$;
revoke all on function public.explore_public_media_ready(text),public.explore_challenge_readable(text),
 public.explore_treasure_readable(text),public.explore_entry_readable(text) from public,anon,authenticated,service_role;
grant execute on function public.explore_public_media_ready(text),public.explore_challenge_readable(text),
 public.explore_treasure_readable(text),public.explore_entry_readable(text) to anon,authenticated;

create policy "Explore challenge access is caller scoped" on public.explore_challenges
 as restrictive for select to anon,authenticated using(public.explore_challenge_readable(id));
create policy "Explore treasure access is caller scoped" on public.explore_treasure_hunts
 as restrictive for select to anon,authenticated using(public.explore_treasure_readable(id));
create policy "Explore entries require readable parent and media" on public.explore_challenge_entries
 as restrictive for select to anon,authenticated using(public.explore_entry_readable(id));
create policy "Explore results require readable parent" on public.explore_challenge_results
 as restrictive for select to anon,authenticated using(public.explore_challenge_readable(challenge_id));
create policy "Explore participation requires readable parent" on public.explore_challenge_participants
 as restrictive for select to authenticated using(public.explore_challenge_readable(challenge_id));
create policy "Explore progress requires readable parent" on public.explore_treasure_progress
 as restrictive for select to authenticated using(public.explore_treasure_readable(hunt_id));
create policy "Explore reactions require readable entry" on public.explore_challenge_entry_reactions
 as restrictive for select to authenticated using(public.explore_entry_readable(entry_id));
-- Clue answers/progress/rewards remain behind their existing grants/RLS and caller-scoped RPCs.

create view public.explore_readable_challenges with(security_barrier=true) as
 select c.* from public.explore_challenges c where public.explore_challenge_readable(c.id);
create view public.explore_readable_treasures with(security_barrier=true) as
 select t.* from public.explore_treasure_hunts t where public.explore_treasure_readable(t.id);
create view public.explore_readable_entries with(security_barrier=true) as
 select e.* from public.explore_challenge_entries e where public.explore_entry_readable(e.id);
create view public.explore_discoverable_takes with(security_barrier=true) as
 select t.* from public.takes t where t.status='active' and t.expires_at>now() and not t.is_runtime_fixture
 and not public.explore_actor_hidden_internal(public.my_profile_id(),t.author_id)
 and (t.media_object_id is null or public.explore_public_media_ready(t.media_object_id));
revoke all on public.explore_readable_challenges,public.explore_readable_treasures,
 public.explore_readable_entries,public.explore_discoverable_takes from public,anon,authenticated,service_role;

-- Rewrite only the audited read chains. Empty search_path and owner execution stay unchanged.
-- These private views intentionally bypass table RLS only through caller-scoped predicates.
do $$
declare r record; definition text; updated text;
begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('get_explore_world_summary','get_explore_country',
 'get_global_viral','get_teleport_candidate','search_explore','get_explore_for_you','get_explore_live',
 'list_play_home','get_challenge_detail','list_challenge_entries','get_treasure_detail','get_my_play','complete_content_clue')
 loop
  definition:=pg_get_functiondef(r.oid);
  updated:=regexp_replace(definition,'\m(from|join)\s+public\.explore_challenges\M','\1 public.explore_readable_challenges','gi');
  updated:=regexp_replace(updated,'\m(from|join)\s+public\.explore_treasure_hunts\M','\1 public.explore_readable_treasures','gi');
  updated:=regexp_replace(updated,'\m(from|join)\s+public\.explore_challenge_entries\M','\1 public.explore_readable_entries','gi');
  updated:=regexp_replace(updated,'\m(from|join)\s+public\.takes\M','\1 public.explore_discoverable_takes','gi');
  if updated=definition then raise exception 'Explore projection anchors changed: %',r.proname; end if;
  execute updated;
 end loop;
 -- Existing preview projection already excludes private/subscriber sources. Removed media was missing.
 definition:=pg_get_functiondef('public.explore_vault_preview_rows(text,text,integer)'::regprocedure);
 updated:=replace(replace(definition,'and m.status = ''ready''','and m.status = ''ready'' and m.deleted_at is null'),
 'and pm.status = ''ready''','and pm.status = ''ready'' and pm.deleted_at is null');
 if updated=definition then raise exception 'Vault preview media anchors changed'; end if;
 execute updated;
 -- Equal timestamps need a final unique tie-breaker; retain existing rank/offset API.
 definition:=pg_get_functiondef('public.list_challenge_entries(text,text,integer,integer)'::regprocedure);
 updated:=regexp_replace(definition,'e\.created_at desc\s*\) as rn','e.created_at desc, e.id asc) as rn');
 if updated=definition then raise exception 'Entry order anchor changed'; end if;
 execute updated;
end $$;

-- Recheck access AFTER existing source-row locks and before writes. Joins now share that lock.
do $$
declare r record; definition text; updated text; anchor text; guard text;
begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('join_challenge','submit_challenge_entry','settle_challenge',
 'join_treasure_hunt','submit_treasure_answer','complete_content_clue','claim_treasure_reward')
 loop
  definition:=pg_get_functiondef(r.oid);
  if r.proname in ('join_challenge','join_treasure_hunt') then
   definition:=replace(definition,'where id = p_challenge_id;','where id = p_challenge_id for update;');
   definition:=replace(definition,'where id = p_hunt_id;','where id = p_hunt_id for update;');
  end if;
  if r.proname in ('join_challenge','submit_challenge_entry','settle_challenge') then
   anchor:='select * into v_ch from public.explore_challenges where id = p_challenge_id for update;';
   guard:=E'
  if v_ch.id is not null and not public.explore_challenge_readable(v_ch.id) then raise exception ''activity unavailable'' using errcode=''42501''; end if;';
   if r.proname<>'settle_challenge' then
    guard:=guard||E'
  if v_ch.starts_at>now() then raise exception ''challenge not open'' using errcode=''P0003''; end if;';
   else
    guard:=guard||E'
  if v_ch.status not in (''active'',''ended'') then raise exception ''challenge unavailable'' using errcode=''42501''; end if;';
   end if;
  else
   -- complete_content_clue's parent read is the private filtered view after the read-chain patch.
   anchor:='select * into v_hunt from public.'||case when r.proname='complete_content_clue' then 'explore_readable_treasures' else 'explore_treasure_hunts' end||' where id = p_hunt_id for update;';
   guard:=E'
  if v_hunt.id is not null and not public.explore_treasure_readable(v_hunt.id) then raise exception ''activity unavailable'' using errcode=''42501''; end if;
  if v_hunt.starts_at>now() then raise exception ''hunt not open'' using errcode=''P0003''; end if;';
  end if;
  updated:=replace(definition,anchor,anchor||guard);
  if updated=definition then raise exception 'Play lock anchor changed: %',r.proname; end if;
  if r.proname='submit_challenge_entry' then
   updated:=replace(updated,'if v_media.status <> ''ready''','if v_media.deleted_at is not null or v_media.status <> ''ready''');
  elsif r.proname='settle_challenge' then
   updated:=replace(updated,'if v_ch.ends_at > now() and v_ch.status = ''active'' then','if v_ch.ends_at > now() then');
   updated:=replace(updated,'and e.status = ''visible''','and e.status = ''visible'' and public.explore_public_media_ready(e.media_object_id)');
  elsif r.proname='complete_content_clue' then
   updated:=replace(updated,'where p.id = v_clue.content_target_id','where p.id = v_clue.content_target_id and not public.explore_actor_hidden_internal(v_user,p.id)');
  end if;
  execute updated;
 end loop;
 -- Serialize reactions on the same parent as submission/settlement, then revalidate the entry.
 definition:=pg_get_functiondef('public.toggle_challenge_entry_reaction(text)'::regprocedure);
 anchor:='select * into v_ch from public.explore_challenges where id = v_entry.challenge_id;';
 updated:=replace(definition,anchor,E'select * into v_ch from public.explore_challenges where id = v_entry.challenge_id for update;
  if not public.explore_entry_readable(p_entry_id) or v_ch.status<>''active'' or v_ch.starts_at>now() or v_ch.ends_at<=now() then raise exception ''entry unavailable'' using errcode=''42501''; end if;');
 if updated=definition then raise exception 'Reaction lock anchor changed'; end if;
 execute updated;
end $$;

-- Explicit anon default privileges survived older REVOKE FROM PUBLIC clauses.
do $$
declare r record;
begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('host_explore_challenge','join_challenge','submit_challenge_entry',
 'toggle_challenge_entry_reaction','settle_challenge','host_explore_treasure','join_treasure_hunt',
 'submit_treasure_answer','complete_content_clue','claim_treasure_reward','get_my_play','sync_challenge_entry_reactions')
 loop
  execute format('revoke execute on function %s from public,anon',r.oid::regprocedure);
  if r.proname='sync_challenge_entry_reactions' then
   execute format('revoke execute on function %s from authenticated',r.oid::regprocedure);
  else
   execute format('grant execute on function %s to authenticated',r.oid::regprocedure);
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
