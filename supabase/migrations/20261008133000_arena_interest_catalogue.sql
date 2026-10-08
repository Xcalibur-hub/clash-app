-- Interests classify existing Hoods; they do not replace event topics or history.
create table public.arena_interests (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,39}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 200),
  icon text,
  position smallint not null unique,
  active boolean not null default true
);
create table public.arena_interest_hoods (
  hood public.hood_id primary key,
  interest_id text not null references public.arena_interests(id) on delete restrict
);
create index arena_interest_hoods_interest_idx on public.arena_interest_hoods(interest_id);
insert into public.arena_interests(id,display_name,description,icon,position) values
 ('technology','Technology','Products, phones and the ideas changing everyday life.','cpu',1),
 ('education','Campus & careers','Education, work and finding your next opportunity.','book-open',2),
 ('local_life','Local life','Places, communities and the everyday issues around you.','map-pin',3),
 ('film','Film & culture','Movies, stories and the opinions they inspire.','film',4),
 ('gaming','Gaming','Games, competition and the communities around them.','gamepad',5),
 ('business','Business & startups','Founders, markets and building something new.','briefcase',6),
 ('sport','Football & sport','Teams, matches and the arguments after the final whistle.','trophy',7);
insert into public.arena_interest_hoods(hood,interest_id) values
 ('techtakes','technology'),('campushustle','education'),('goatalk','local_life'),
 ('movies','film'),('gaming','gaming'),('startups','business'),('football','sport');
alter table public.arena_interests enable row level security;
alter table public.arena_interest_hoods enable row level security;
create policy interests_authenticated_read on public.arena_interests for select to authenticated using (active);
create policy interest_mappings_authenticated_read on public.arena_interest_hoods for select to authenticated
 using (exists(select 1 from public.arena_interests i where i.id=interest_id and i.active));
revoke all on public.arena_interests,public.arena_interest_hoods from public,anon,authenticated;
grant select on public.arena_interests,public.arena_interest_hoods to authenticated;
-- No authenticated mutation grants/policies: only migrations/operators curate.
notify pgrst,'reload schema';
