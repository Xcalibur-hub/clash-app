-- Private editorial workflow. No sources, publisher, cron or automation enabled.
create table public.arena_editorial_config (
 id boolean primary key default true check(id),
 mode text not null default 'REVIEW_ONLY' check(mode in('OFF','REVIEW_ONLY','LIMITED_AUTO')),
 paused boolean not null default true,
 publisher_id text references public.profiles(id),
 daily_cap integer not null default 6 check(daily_cap between 1 and 20),
 category_cap integer not null default 2 check(category_cap between 1 and 5),
 generation_cap integer not null default 10 check(generation_cap between 1 and 20),
 max_age_hours integer not null default 48 check(max_age_hours between 1 and 72),
 run_id uuid, lease_until timestamptz
);
insert into public.arena_editorial_config(id) values(true);
create table public.arena_editorial_sources (
 id text primary key check(id ~ '^[a-z0-9_-]{1,40}$'),
 adapter text not null check(adapter in('rss','json')),
 feed_url text not null check(length(feed_url)<=2048 and feed_url ~ '^https://[a-zA-Z0-9.-]+/[^[:space:]]*$'),
 link_host text not null check(link_host ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'),
 publisher_group text not null check(length(publisher_group) between 1 and 80),
 category text not null check(category in('technology','gaming','entertainment','sports','internet_culture','science','current_affairs')),
 credibility numeric not null check(credibility between 0 and 1),
 enabled boolean not null default false,
 auto_allowed boolean not null default false,
 secret_name text check(secret_name ~ '^ARENA_SOURCE_[A-Z0-9_]{1,50}$')
);
create table public.arena_trend_candidates (
 id uuid primary key default gen_random_uuid(), topic_key text not null unique,
 tokens text[] not null, title text not null check(length(title) between 3 and 200),
 summary text not null check(length(summary)<=400), category text not null,
 discovered_at timestamptz not null default clock_timestamp(),
 status text not null check(status in('discovered','normalized','verified','generated','reviewed','approved','rejected','published','failed')),
 generation_version integer not null default 0, attempts integer not null default 0,
 retry_at timestamptz not null default now(), published_take_id text unique references public.takes(id),
 approved_by text references public.profiles(id), approved_version integer,
 score numeric not null default 0, rank_details jsonb not null default '{}', is_runtime_fixture boolean not null default false
);
create table public.arena_trend_observations (
 id bigint generated always as identity primary key,
 candidate_id uuid not null references public.arena_trend_candidates(id),
 source_id text not null references public.arena_editorial_sources(id),
 url text not null unique check(length(url)<=2048 and url ~ '^https://[^[:space:]]+$'),
 title text not null check(length(title) between 3 and 200), summary text not null check(length(summary)<=400),
 published_at timestamptz not null, discovered_at timestamptz not null default clock_timestamp(),
 language text check(length(language)<=12), region text check(length(region)<=40), withdrawn boolean not null default false
);
create index arena_observation_candidate on public.arena_trend_observations(candidate_id);
create table public.arena_editorial_drafts (
 candidate_id uuid references public.arena_trend_candidates(id), version integer not null check(version>0),
 question text not null check(length(btrim(question)) between 1 and 180),
 side_a text not null check(length(btrim(side_a)) between 1 and 60),
 side_b text not null check(length(btrim(side_b)) between 1 and 60),
 context text not null check(length(btrim(context)) between 1 and 400),
 confidence numeric not null check(confidence between 0 and 1),
 needs_human boolean not null, blocked boolean not null, kind text not null,
 source_urls text[] not null, provider text not null check(length(provider) between 1 and 80),
 model text not null check(length(model) between 1 and 100), prompt_version text not null check(length(prompt_version) between 1 and 40),
 created_at timestamptz not null default clock_timestamp(),
 primary key(candidate_id,version), check(lower(btrim(side_a))<>lower(btrim(side_b)))
);
create table public.arena_editorial_events (
 id bigint generated always as identity primary key, candidate_id uuid references public.arena_trend_candidates(id),
 operation text not null check(length(operation)<=60), reason text not null check(length(reason)<=80),
 actor_id text references public.profiles(id), version integer, created_at timestamptz not null default clock_timestamp()
);
create index arena_editorial_events_time on public.arena_editorial_events(created_at desc,id desc);
alter table public.takes add column question_context text check(length(question_context)<=400),
 add column question_sources jsonb, add column question_ai_generated boolean not null default false;
alter table public.takes add constraint arena_editorial_take_metadata check (
 (not question_ai_generated and question_context is null and question_sources is null)
 or (question_ai_generated and question_a is not null and question_b is not null and question_origin is not null and question_review_status is not null and question_origin='editorial' and question_review_status='approved'
 and question_context is not null and question_sources is not null and jsonb_typeof(question_sources)='array'
 and jsonb_array_length(question_sources) between 1 and 8));
revoke insert(question_context,question_sources,question_ai_generated),update(question_context,question_sources,question_ai_generated) on public.takes from anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['arena_editorial_config','arena_editorial_sources','arena_trend_candidates','arena_trend_observations','arena_editorial_drafts','arena_editorial_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

revoke all on sequence public.arena_trend_observations_id_seq,public.arena_editorial_events_id_seq from public,anon,authenticated,service_role;

create function public.arena_editorial_tokens(p_text text) returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(t order by t),'{}') from (select distinct t from regexp_split_to_table(lower(p_text),'[^[:alnum:]]+') t
 where length(t)>=3 and t<>all(array['the','and','for','with','from','that','this','after','into','new','its','has','are','was','will']) order by t limit 32) s;
$$;
create function public.arena_editorial_sensitive(p_text text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_text ~* '\m(alleg\w*|accus\w*|arrest\w*|crime|criminal|fraud|scam|rape|sexual|suicid\w*|kill\w*|death|died|dead|war|terror\w*|hate|racis\w*|election|politic\w*|president|minister|religio\w*|caste|medical|cancer|vaccine|disease|treatment|invest\w*|stock|profit|child\w*|minor|private|address|phone number|leak\w*|rumou?r\w*|unconfirmed|reportedly|evil|idiot\w*|stupid|obviously)\M',true);
$$;
create function public.arena_editorial_interest(p_category text) returns text language sql stable set search_path='' as $$
 select ih.interest_id from public.arena_interest_hoods ih join public.arena_interests i on i.id=ih.interest_id where i.active and ih.hood::text=
  case p_category when 'technology' then 'techtakes' when 'gaming' then 'gaming' when 'entertainment' then 'movies' when 'sports' then 'football' when 'internet_culture' then 'movies' when 'science' then 'techtakes' when 'current_affairs' then 'startups' end order by i.position limit 1;
$$;
create function public.arena_editorial_event(p_id uuid,p_operation text,p_reason text,p_version integer default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.arena_editorial_events(candidate_id,operation,reason,actor_id,version)
 values(p_id,p_operation,p_reason,public.my_profile_id(),p_version);
 delete from public.arena_editorial_events where id in(select id from public.arena_editorial_events order by created_at desc,id desc offset 10000 limit 100);
end $$;

-- Worker protocol: one lease covers external calls, which never hold SQL locks.
create function public.arena_editorial_worker(p_action text,p_run uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
<<worker>>
declare cfg public.arena_editorial_config%rowtype; src public.arena_editorial_sources%rowtype;
 c public.arena_trend_candidates%rowtype; cid uuid; ts timestamptz; toks text[]; key text;
 n integer; independent integer; credit numeric; title text; summary text; v_url text; v integer;
 interest_matches integer; discussion numeric; domains integer; overlap boolean;
 blocked boolean; human boolean; refs text[]; payload jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker only' using errcode='42501'; end if;
 select * into cfg from public.arena_editorial_config where id for update;
 if p_action='claim' then
  if cfg.paused or cfg.mode='OFF' then return jsonb_build_object('disabled',true); end if;
  if cfg.lease_until>clock_timestamp() then return jsonb_build_object('busy',true); end if;
  perform public.assert_rate_limit('arena-editorial','editorial_runs',4,interval '1 hour');
  update public.arena_editorial_config set run_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '10 minutes' where id returning * into cfg;
  perform public.arena_editorial_event(null,'run','started');
  return jsonb_build_object('runId',cfg.run_id,'mode',cfg.mode,'maxAgeHours',cfg.max_age_hours,'sources',coalesce((select jsonb_agg(to_jsonb(s)) from
   (select * from public.arena_editorial_sources where enabled order by id limit 8) s),'[]'::jsonb));
 end if;
 if p_run is null or p_run is distinct from cfg.run_id or cfg.lease_until<=clock_timestamp() then raise exception 'Lease invalid' using errcode='42501'; end if;
 if p_action='release' then
  update public.arena_editorial_config set run_id=null,lease_until=null where id;
  perform public.arena_editorial_event(null,'run','finished'); return '{}'::jsonb;
 end if;
 if cfg.paused or cfg.mode='OFF' then raise exception 'Automation paused' using errcode='42501'; end if;
 if p_action='source_failure' then
  perform public.arena_editorial_event(null,'source','source_unavailable:'||left(coalesce(p_data->>'sourceId','unknown'),40)); return '{}'::jsonb;
 elsif p_action='ingest' then
  select * into src from public.arena_editorial_sources where id=p_data->>'sourceId' and enabled;
  if not found then raise exception 'Source unavailable' using errcode='22023'; end if;
  title:=btrim(p_data->>'title'); summary:=btrim(coalesce(p_data->>'summary','')); v_url:=p_data->>'url'; ts:=(p_data->>'publishedAt')::timestamptz;
  if title is null or length(title) not between 3 and 200 or length(summary)>400 or ts is null
   or ts<clock_timestamp()-make_interval(hours=>cfg.max_age_hours) or ts>clock_timestamp()+interval '5 minutes'
   or v_url is null or v_url !~ '^https://[^[:space:]]+$' or lower(split_part(v_url,'/',3))<>src.link_host
   or v_url ~ '[@#]' or length(v_url)>2048 then raise exception 'Invalid or expired source' using errcode='22023'; end if;
  select candidate_id into cid from public.arena_trend_observations where url=v_url;
  if found then return jsonb_build_object('id',cid,'duplicate',true); end if;
  toks:=public.arena_editorial_tokens(title);
  if cardinality(toks)<3 then raise exception 'Insufficient topic identity' using errcode='22023'; end if;
  key:=src.category||':'||md5(array_to_string(toks,' '));
  select x.id into cid from public.arena_trend_candidates x where x.category=src.category and
   (x.topic_key=key or (x.discovered_at>now()-interval '7 days' and
    (select count(*) from unnest(toks) t where t=any(x.tokens))>=greatest(3,ceil(least(cardinality(toks),cardinality(x.tokens))*0.8))
    and array(select t from unnest(toks) t where t ~ '^[0-9]+$')=array(select t from unnest(x.tokens) t where t ~ '^[0-9]+$')))
   order by (x.topic_key=key) desc,x.discovered_at desc limit 1;
  if cid is null then
   if (select count(*) from public.arena_trend_candidates where discovered_at>now()-interval '1 day')>=1000 then raise exception 'Candidate capacity reached' using errcode='P0001'; end if;
   insert into public.arena_trend_candidates(topic_key,tokens,title,summary,category,status) values(key,toks,title,summary,src.category,'discovered') returning id into cid;
   perform public.arena_editorial_event(cid,'discovered','source_received');
   update public.arena_trend_candidates set status='normalized' where id=cid;
   perform public.arena_editorial_event(cid,'normalized','topic_grouped');
  end if;
  if (select count(*) from public.arena_trend_observations where candidate_id=cid)>=32 then raise exception 'Observation capacity reached' using errcode='P0001'; end if;
  insert into public.arena_trend_observations(candidate_id,source_id,url,title,summary,published_at,language,region)
   values(cid,src.id,v_url,title,summary,ts,p_data->>'language',p_data->>'region');
  select least(count(distinct s.publisher_group),count(distinct s.link_host)),max(s.credibility),count(distinct s.link_host) into independent,credit,domains from public.arena_trend_observations o join public.arena_editorial_sources s on s.id=o.source_id
   where o.candidate_id=cid and not o.withdrawn and s.enabled and o.published_at>clock_timestamp()-make_interval(hours=>cfg.max_age_hours);
  select count(*) into interest_matches from public.arena_interest_preferences where public.arena_editorial_interest(src.category)=any(topic_ids);
  discussion:=case when title ~* '\m(release|launch|announce|schedule)\w*\M' then 1 else 0.5 end;
  overlap:=exists(select 1 from public.takes t where t.question_a is not null and t.status='active' and not t.is_runtime_fixture and t.expires_at>clock_timestamp()
   and (select count(*) from unnest(public.arena_editorial_tokens(t.text||' '||coalesce(t.question_context,''))) token where token=any(toks))>=greatest(3,ceil(cardinality(toks)*0.8)));
  update public.arena_trend_candidates set score=round((credit*35+least(independent,3)*10+least(domains,3)*2+least(interest_matches,10)+discussion*5+greatest(0,25-extract(epoch from(clock_timestamp()-ts))/3600)-case when overlap then 100 else 0 end)::numeric,3),
   rank_details=jsonb_build_object('credibility',credit,'independentPublishers',independent,'sourceDomains',domains,'interestMatches',interest_matches,'discussionPotentialHeuristic',discussion,'existingQuestionOverlap',overlap,'freshnessHours',round((extract(epoch from(clock_timestamp()-ts))/3600)::numeric,2),'taxonomyMapped',public.arena_editorial_interest(src.category) is not null),
   status=case when status='normalized' and credit>=0.8 then 'verified' else status end where id=cid returning * into c;
  if c.status='verified' then perform public.arena_editorial_event(cid,'verified','trusted_attribution'); end if;
  return jsonb_build_object('id',cid,'status',c.status);
 elsif p_action='work' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(w)) from (select tc.*,
   (select jsonb_agg(jsonb_build_object('url',o.url,'title',o.title,'summary',o.summary,'publishedAt',o.published_at,'language',o.language)) from
    (select ob.* from public.arena_trend_observations ob join public.arena_editorial_sources s on s.id=ob.source_id where ob.candidate_id=tc.id and not ob.withdrawn and s.enabled and ob.published_at>clock_timestamp()-make_interval(hours=>cfg.max_age_hours) order by ob.published_at desc,ob.id limit 8) o) sources
   from public.arena_trend_candidates tc where tc.status in('verified','failed','reviewed') and tc.attempts<4 and tc.retry_at<=clock_timestamp()
   and exists(select 1 from public.arena_trend_observations o join public.arena_editorial_sources s on s.id=o.source_id where o.candidate_id=tc.id and not o.withdrawn and s.enabled and o.published_at>clock_timestamp()-make_interval(hours=>cfg.max_age_hours))
   and not coalesce((tc.rank_details->>'existingQuestionOverlap')::boolean,false)
   order by tc.score desc,tc.id limit 12) w),'[]'::jsonb));
 end if;
 cid:=(p_data->>'id')::uuid;
 select * into c from public.arena_trend_candidates where id=cid for update;
 if not found then raise exception 'Candidate unavailable' using errcode='22023'; end if;
 if p_action='publication_deferred' then
  perform public.arena_editorial_event(cid,'publication_deferred',case when p_data->>'reason' in('42501','P0001','P0006','22023') then p_data->>'reason' else 'publication_unavailable' end,c.generation_version);
  return '{}'::jsonb;
 elsif p_action='begin_generation' then
  if c.status not in('verified','failed') or c.attempts>=4 or c.retry_at>clock_timestamp() then raise exception 'Not eligible for generation' using errcode='22023'; end if;
  perform public.assert_rate_limit('arena-editorial','editorial_generation',cfg.generation_cap,interval '1 hour');
  update public.arena_trend_candidates set generation_version=generation_version+1,attempts=attempts+1,status='verified',approved_by=null,approved_version=null where id=cid returning generation_version into v;
  perform public.arena_editorial_event(cid,'generation','started',v); return jsonb_build_object('version',v);
 elsif p_action='fail' then
  if c.status in('published','rejected','approved') then raise exception 'Terminal candidate' using errcode='22023'; end if;
  update public.arena_trend_candidates set status='failed',retry_at=clock_timestamp()+make_interval(mins=>least(240, power(2,greatest(1,attempts))::int)) where id=cid;
  perform public.arena_editorial_event(cid,'failure',case when p_data->>'reason' in('not_configured','provider_unavailable','invalid_generation','generation_quota') then p_data->>'reason' else 'processing_failed' end,c.generation_version); return '{}'::jsonb;
 elsif p_action='generated' then
  v:=(p_data->>'version')::integer; payload:=p_data->'draft';
  if v is null or v<=0 or v is distinct from c.generation_version or c.status not in('verified','generated','reviewed') then raise exception 'Stale generation' using errcode='40001'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or jsonb_typeof(payload->'sourceUrls')<>'array' or jsonb_array_length(payload->'sourceUrls') not between 1 and 8
   or jsonb_typeof(payload->'needsHuman')<>'boolean' or jsonb_typeof(payload->'blocked')<>'boolean' or jsonb_typeof(payload->'confidence')<>'number'
   or payload->>'question' is null or payload->>'sideA' is null or payload->>'sideB' is null or payload->>'context' is null or payload->>'kind' is null
   or (payload->>'question') !~ '[[:alnum:]]' or (payload->>'sideA') !~ '[[:alnum:]]' or (payload->>'sideB') !~ '[[:alnum:]]' then raise exception 'Invalid generation' using errcode='22023'; end if;
  refs:=array(select distinct jsonb_array_elements_text(payload->'sourceUrls'));
  if exists(select 1 from unnest(refs) u where not exists(select 1 from public.arena_trend_observations o join public.arena_editorial_sources s on s.id=o.source_id
   where o.candidate_id=cid and o.url=u and not o.withdrawn and s.enabled and o.published_at>clock_timestamp()-make_interval(hours=>cfg.max_age_hours))) then raise exception 'Unverified reference' using errcode='22023'; end if;
  blocked:=(payload->>'blocked')::boolean or concat_ws(' ',payload->>'question',payload->>'sideA',payload->>'sideB') ~* '\m(doxx?\w*|rape|suicid\w*|kill|inferior|subhuman)\M';
  human:=(payload->>'needsHuman')::boolean or c.category in('science','internet_culture','current_affairs') or public.arena_editorial_sensitive(concat_ws(' ',c.title,c.summary,payload->>'question',payload->>'context',payload->>'sideA',payload->>'sideB')) or (payload->>'confidence')::numeric<0.95;
  human:=human or exists(select 1 from public.arena_trend_observations where candidate_id=cid and url=any(refs) and coalesce(language,'') !~ '^en(-[A-Za-z]{2})?$');
  if exists(select 1 from public.arena_editorial_drafts where candidate_id=cid and version=v) then
   if not exists(select 1 from public.arena_editorial_drafts d where d.candidate_id=cid and d.version=v
    and (d.question,d.side_a,d.side_b,d.context,d.confidence,d.needs_human,d.blocked,d.kind,d.provider,d.model,d.prompt_version)
     is not distinct from (btrim(payload->>'question'),btrim(payload->>'sideA'),btrim(payload->>'sideB'),payload->>'context',(payload->>'confidence')::numeric,human,worker.blocked,payload->>'kind',p_data->>'provider',p_data->>'model',p_data->>'promptVersion')
    and d.source_urls @> refs and refs @> d.source_urls) then raise exception 'Generation version conflict' using errcode='40001'; end if;
   return jsonb_build_object('duplicate',true);
  end if;
  insert into public.arena_editorial_drafts(candidate_id,version,question,side_a,side_b,context,confidence,needs_human,blocked,kind,source_urls,provider,model,prompt_version)
   values(cid,v,btrim(payload->>'question'),btrim(payload->>'sideA'),btrim(payload->>'sideB'),payload->>'context',(payload->>'confidence')::numeric,human,blocked,payload->>'kind',refs,p_data->>'provider',p_data->>'model',p_data->>'promptVersion');
  update public.arena_trend_candidates set status='generated' where id=cid; perform public.arena_editorial_event(cid,'generated','validated',v);
  update public.arena_trend_candidates set status=case when blocked then 'rejected' else 'reviewed' end where id=cid;
  perform public.arena_editorial_event(cid,case when blocked then 'rejected' else 'reviewed' end,case when human then 'human_review_required' else 'restricted_auto_candidate' end,v);
  return jsonb_build_object('needsHuman',human,'blocked',blocked);
 end if;
 raise exception 'Unknown operation' using errcode='22023';
end $$;

create function public.publish_arena_editorial(p_id uuid,p_version integer,p_auto boolean default false,p_run uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.arena_editorial_config%rowtype; c public.arena_trend_candidates%rowtype; d public.arena_editorial_drafts%rowtype;
 take_id text; h public.hood_id; topic text; refs jsonb; independent integer; bad integer; first_time timestamptz;
 expected_q text; expected_a text; expected_b text;
begin
 if p_auto is null or (p_auto and coalesce(auth.role(),'')<>'service_role') or (not p_auto and not public.is_staff()) then raise exception 'Editorial authorization required' using errcode='42501'; end if;
 select * into cfg from public.arena_editorial_config where id for update;
 if p_auto and (p_run is null or p_run is distinct from cfg.run_id or cfg.lease_until<=clock_timestamp()) then raise exception 'Lease invalid' using errcode='42501'; end if;
 select * into c from public.arena_trend_candidates where id=p_id for update;
 if not found then raise exception 'Candidate unavailable' using errcode='22023'; end if;
 if c.published_take_id is not null then return jsonb_build_object('takeId',c.published_take_id,'status',(select status from public.takes where id=c.published_take_id),'duplicate',true); end if;
 if cfg.paused or cfg.mode='OFF' or (p_auto and cfg.mode<>'LIMITED_AUTO') then raise exception 'Publication disabled' using errcode='42501'; end if;
 if cfg.publisher_id is null or not exists(select 1 from public.profiles where id=cfg.publisher_id and role in('admin','moderator') and auth_user_id is not null) then raise exception 'Staff publisher required' using errcode='42501'; end if;
 select * into d from public.arena_editorial_drafts where candidate_id=p_id and version=p_version;
 if not found or p_version<>c.generation_version or d.blocked or c.status not in('reviewed','approved') then raise exception 'Draft unavailable' using errcode='22023'; end if;
 select case c.category when 'technology' then 'techtakes' when 'gaming' then 'gaming' when 'entertainment' then 'movies' when 'sports' then 'football'
  when 'internet_culture' then 'movies' when 'science' then 'techtakes' when 'current_affairs' then 'startups' end::public.hood_id into h;
 select interest_id into topic from public.arena_interest_hoods ih join public.arena_interests i on i.id=ih.interest_id where ih.hood=h and i.active order by i.position limit 1;
 if h is null or topic is null then raise exception 'Taxonomy unavailable' using errcode='22023'; end if;
 select least(count(distinct s.publisher_group),count(distinct s.link_host)),count(*) filter(where o.withdrawn or not s.enabled or lower(split_part(o.url,'/',3))<>s.link_host or o.published_at<clock_timestamp()-make_interval(hours=>cfg.max_age_hours) or o.published_at>clock_timestamp()+interval '5 minutes'),
  min(o.published_at),jsonb_agg(jsonb_build_object('url',o.url,'title',o.title,'publisher',s.publisher_group) order by o.url)
 into independent,bad,first_time,refs from public.arena_trend_observations o join public.arena_editorial_sources s on s.id=o.source_id where o.candidate_id=p_id and o.url=any(d.source_urls);
 if bad>0 or refs is null or jsonb_array_length(refs)<>cardinality(d.source_urls) then raise exception 'Attribution unavailable or stale' using errcode='42501'; end if;
 if p_auto then
  -- Auto mode permits only fixed, neutral trade-offs, with source-exact context.
  select case c.category when 'technology' then 'For this technology release, which matters more?' when 'gaming' then 'For this game release, which matters more?' when 'entertainment' then 'For this film release, which matters more?' when 'sports' then 'For this sports schedule, which matters more?' end,
   case c.category when 'technology' then 'More features' when 'gaming' then 'New content' when 'entertainment' then 'Original stories' when 'sports' then 'More matches' end,
   case c.category when 'technology' then 'Better reliability' when 'gaming' then 'Better performance' when 'entertainment' then 'Familiar characters' when 'sports' then 'More rest' end into expected_q,expected_a,expected_b;
  if d.needs_human or d.confidence<0.95 or independent<2 or d.kind<>'release_or_schedule'
   or expected_q is null or d.question<>expected_q or d.side_a<>expected_a or d.side_b<>expected_b
   or c.title !~* '\m(release|launch|announce|schedule)\w*\M' or public.arena_editorial_sensitive(c.title||' '||c.summary||' '||d.context)
   or (c.title||' '||c.summary||' '||d.context) ~ '[^ -~[:space:]]'
   or not exists(select 1 from public.arena_trend_observations where candidate_id=p_id and url=any(d.source_urls) and summary=d.context)
   or exists(select 1 from public.arena_trend_observations o join public.arena_editorial_sources s on s.id=o.source_id where o.candidate_id=p_id and o.url=any(d.source_urls) and (not s.auto_allowed or s.credibility<0.8 or coalesce(o.language,'') !~ '^en(-[A-Za-z]{2})?$'))
   then raise exception 'Human approval required' using errcode='42501'; end if;
  perform public.arena_editorial_event(p_id,'approved','restricted_auto_policy',p_version);
 elsif c.status<>'approved' or c.approved_by is null or c.approved_version<>p_version then raise exception 'Human approval required' using errcode='42501'; end if;
 -- Source/config changes, quotas and all publications serialize on config first.
 if (select count(*) from public.arena_trend_candidates x join public.takes t on t.id=x.published_take_id where t.created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')>=cfg.daily_cap
  or (select count(*) from public.arena_trend_candidates x join public.takes t on t.id=x.published_take_id where x.category=c.category and t.created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')>=cfg.category_cap then raise exception 'Publication quota reached' using errcode='P0001'; end if;
 if exists(select 1 from public.takes t where t.created_at>clock_timestamp()-interval '7 days' and t.question_a is not null
  and not t.is_runtime_fixture and ((lower(t.text)=lower(d.question) and (not t.question_ai_generated or t.question_context=d.context)) or (select count(*) from unnest(public.arena_editorial_tokens(t.text||' '||coalesce(t.question_context,''))) token where token=any(c.tokens))>=greatest(3,ceil(cardinality(c.tokens)*0.8)))) then raise exception 'Existing question overlaps' using errcode='P0006'; end if;
 take_id:='take_ed_'||replace(p_id::text,'-','');
 insert into public.takes(id,author_id,hood,text,question_a,question_b,question_topic_id,question_origin,question_review_status,question_source_url,question_source_published_at,question_context,question_sources,question_ai_generated,is_runtime_fixture)
  values(take_id,cfg.publisher_id,h,d.question,d.side_a,d.side_b,topic,'editorial','approved',d.source_urls[1],first_time,d.context,refs,true,c.is_runtime_fixture);
 update public.arena_trend_candidates set status='published',published_take_id=take_id where id=p_id;
 perform public.arena_editorial_event(p_id,'published',case when p_auto then 'automatic' else 'staff_approved' end,p_version);
 return jsonb_build_object('takeId',take_id,'status','active','duplicate',false);
end $$;

create function public.arena_editorial_admin(p_action text,p_data jsonb default '{}',p_expected_auth_uid uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.arena_editorial_config%rowtype; c public.arena_trend_candidates%rowtype; oid bigint; v integer; decision text;
begin
 if not public.is_staff() or (p_expected_auth_uid is not null and p_expected_auth_uid is distinct from auth.uid()) then raise exception 'Staff only' using errcode='42501'; end if;
 select * into cfg from public.arena_editorial_config where id for update;
 if p_action='inspect' then
  if (p_data->>'before' is null)<>(p_data->>'beforeId' is null) then raise exception 'Full inspection cursor required' using errcode='22023'; end if;
  return jsonb_build_object('config',to_jsonb(cfg)-'run_id','sources',(select coalesce(jsonb_agg(to_jsonb(s)-'secret_name'),'[]') from public.arena_editorial_sources s),
   'candidates',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select tc.*,
    (select jsonb_agg(to_jsonb(o)) from public.arena_trend_observations o where o.candidate_id=tc.id) sources,
    (select jsonb_agg(to_jsonb(d) order by version desc) from public.arena_editorial_drafts d where d.candidate_id=tc.id) drafts
    from public.arena_trend_candidates tc where (p_data->>'before' is null or (tc.discovered_at,tc.id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid)) order by tc.discovered_at desc,tc.id desc limit 30) x),
   'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (select * from public.arena_editorial_events order by id desc limit 100) e));
 elsif p_action in('configure','source') then
  if not exists(select 1 from public.profiles where auth_user_id=auth.uid() and role='admin') then raise exception 'Admin only' using errcode='42501'; end if;
  if p_action='configure' then
   if not (p_data ? 'mode' and p_data ? 'paused') then raise exception 'Explicit mode and pause required' using errcode='22023'; end if;
   update public.arena_editorial_config set mode=p_data->>'mode',paused=(p_data->>'paused')::boolean,
    publisher_id=coalesce(p_data->>'publisherId',publisher_id),daily_cap=coalesce((p_data->>'dailyCap')::int,daily_cap),
    category_cap=coalesce((p_data->>'categoryCap')::int,category_cap),generation_cap=coalesce((p_data->>'generationCap')::int,generation_cap),
    max_age_hours=coalesce((p_data->>'maxAgeHours')::int,max_age_hours) where id;
  else
   if not exists(select 1 from public.arena_editorial_sources where id=p_data->>'id') and (select count(*) from public.arena_editorial_sources)>=32 then raise exception 'Source capacity reached' using errcode='P0001'; end if;
   if coalesce((p_data->>'enabled')::boolean,false) and (select count(*) from public.arena_editorial_sources where enabled and id<>p_data->>'id')>=8 then raise exception 'Enabled source capacity reached' using errcode='P0001'; end if;
   insert into public.arena_editorial_sources(id,adapter,feed_url,link_host,publisher_group,category,credibility,enabled,auto_allowed,secret_name)
    values(p_data->>'id',p_data->>'adapter',p_data->>'feedUrl',p_data->>'linkHost',p_data->>'publisherGroup',p_data->>'category',(p_data->>'credibility')::numeric,coalesce((p_data->>'enabled')::boolean,false),coalesce((p_data->>'autoAllowed')::boolean,false),p_data->>'secretName')
    on conflict(id) do update set adapter=excluded.adapter,feed_url=excluded.feed_url,link_host=excluded.link_host,publisher_group=excluded.publisher_group,category=excluded.category,credibility=excluded.credibility,enabled=excluded.enabled,auto_allowed=excluded.auto_allowed,secret_name=excluded.secret_name;
  end if;
  perform public.arena_editorial_event(null,p_action,'operator_configuration'); return '{}'::jsonb;
 elsif p_action='withdraw_source' then
  oid:=(p_data->>'observationId')::bigint;
  update public.arena_trend_observations set withdrawn=true where id=oid returning candidate_id into c.id;
  if not found then raise exception 'Observation unavailable' using errcode='22023'; end if;
  update public.arena_trend_candidates set status='rejected',approved_by=null,approved_version=null where id=c.id returning * into c;
  if c.published_take_id is not null then update public.takes set status='removed' where id=c.published_take_id; end if;
  perform public.arena_editorial_event(c.id,'withdrawn','source_moderation',c.generation_version); return '{}'::jsonb;
 elsif p_action='publish' then
  return public.publish_arena_editorial((p_data->>'id')::uuid,(p_data->>'version')::int,false);
 end if;
 select * into c from public.arena_trend_candidates where id=(p_data->>'id')::uuid for update;
 if not found then raise exception 'Candidate unavailable' using errcode='22023'; end if;
 if p_action='review' then
  v:=(p_data->>'version')::int; decision:=p_data->>'decision';
  if v is null or v<>c.generation_version or c.status not in('reviewed','approved','rejected') or c.published_take_id is not null
   or decision is null or decision not in('approve','reject') then raise exception 'Invalid review' using errcode='22023'; end if;
  if not exists(select 1 from public.arena_editorial_drafts where candidate_id=c.id and version=v and not blocked) then raise exception 'Draft blocked or absent' using errcode='42501'; end if;
  update public.arena_trend_candidates set status=case when decision='approve' then 'approved' else 'rejected' end,
   approved_by=case when decision='approve' then public.my_profile_id() end,approved_version=case when decision='approve' then v end where id=c.id;
  perform public.arena_editorial_event(c.id,case when decision='approve' then 'approved' else 'rejected' end,'human_decision',v);
 elsif p_action='retry' then
  if c.status<>'failed' or c.attempts>=4 then raise exception 'Retry unavailable' using errcode='22023'; end if;
  update public.arena_trend_candidates set retry_at=clock_timestamp() where id=c.id;
  perform public.arena_editorial_event(c.id,'retry','operator_requested',c.generation_version);
 else raise exception 'Unknown operation' using errcode='22023'; end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.arena_editorial_tokens(text),public.arena_editorial_sensitive(text),public.arena_editorial_interest(text),public.arena_editorial_event(uuid,text,text,integer),
 public.arena_editorial_worker(text,uuid,jsonb),public.publish_arena_editorial(uuid,integer,boolean,uuid),public.arena_editorial_admin(text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.arena_editorial_worker(text,uuid,jsonb) to service_role;
grant execute on function public.publish_arena_editorial(uuid,integer,boolean,uuid) to service_role,authenticated;
grant execute on function public.arena_editorial_admin(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
