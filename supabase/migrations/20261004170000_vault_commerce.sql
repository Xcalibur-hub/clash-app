-- ============================================================================
-- CLASH · Phase 15.1 — Vault Services + Store + Courses
-- Catalog / access / requests / progress. No payment provider.
-- Identity always from my_profile_id(). Client writes revoked.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.vault_offer_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_offer_access as enum ('free', 'subscriber', 'paid', 'contact');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_service_category as enum (
    'consultation', 'coaching', 'custom_content', 'commission',
    'private_session', 'creative_service', 'event', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_service_delivery as enum ('online', 'in_person', 'custom', 'external');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_service_request_status as enum (
    'requested', 'accepted', 'declined', 'cancelled', 'completed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_product_type as enum ('digital', 'physical', 'merch', 'external');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_inventory_mode as enum ('unlimited', 'limited', 'external');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vault_lesson_content as enum ('video', 'text', 'image');
exception when duplicate_object then null; end $$;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.vault_profiles_blocked(p_a text, p_b text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.viewer_has_vault_subscription(p_creator_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.creator_vaults v
      join public.vault_subscriptions s on s.vault_id = v.id
     where v.creator_id = p_creator_id
       and v.status = 'active'
       and s.subscriber_id = public.my_profile_id()
       and s.status in ('active', 'trial')
       and s.current_period_end > now()
  );
$$;

create or replace function public.vault_public_cover(p_media_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when m.id is not null
     and m.status = 'ready'
     and m.deleted_at is null
     and m.visibility = 'public'
     and m.bucket = 'public-media'
    then jsonb_build_object('bucket', m.bucket, 'path', m.storage_path, 'kind', m.media_kind)
    else null
  end
  from public.media_objects m
  where m.id = p_media_id;
$$;

revoke all on function public.vault_profiles_blocked(text, text) from public;
grant execute on function public.vault_profiles_blocked(text, text) to anon, authenticated;
revoke all on function public.viewer_has_vault_subscription(text) from public;
grant execute on function public.viewer_has_vault_subscription(text) to anon, authenticated;
revoke all on function public.vault_public_cover(text) from public;
grant execute on function public.vault_public_cover(text) to anon, authenticated;

-- ── Services ────────────────────────────────────────────────────────────────
create table if not exists public.creator_services (
  id                   text primary key,
  creator_id           text not null references public.profiles (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 80),
  description          text not null default '' check (char_length(description) <= 2000),
  category             public.vault_service_category not null default 'other',
  cover_media_object_id text references public.media_objects (id) on delete set null,
  access_type          public.vault_offer_access not null default 'contact',
  price_amount_minor   bigint check (price_amount_minor is null or price_amount_minor >= 0),
  currency             text check (currency is null or currency ~ '^[A-Z]{3}$'),
  delivery_type        public.vault_service_delivery not null default 'online',
  external_url         text,
  status               public.vault_offer_status not null default 'draft',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint creator_services_paid_price check (
    access_type <> 'paid' or price_amount_minor is not null or external_url is not null
  )
);

create index if not exists creator_services_creator_status_idx
  on public.creator_services (creator_id, status, updated_at desc);

create table if not exists public.vault_service_requests (
  id            text primary key,
  service_id    text not null references public.creator_services (id) on delete cascade,
  creator_id    text not null references public.profiles (id) on delete cascade,
  requester_id  text not null references public.profiles (id) on delete cascade,
  message       text not null check (char_length(message) between 1 and 500),
  status        public.vault_service_request_status not null default 'requested',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (service_id, requester_id)
);

create index if not exists vault_service_requests_creator_idx
  on public.vault_service_requests (creator_id, status, created_at desc);
create index if not exists vault_service_requests_requester_idx
  on public.vault_service_requests (requester_id, created_at desc);

-- ── Products ────────────────────────────────────────────────────────────────
create table if not exists public.creator_products (
  id                    text primary key,
  creator_id            text not null references public.profiles (id) on delete cascade,
  title                 text not null check (char_length(title) between 1 and 80),
  description           text not null default '' check (char_length(description) <= 2000),
  product_type          public.vault_product_type not null default 'digital',
  cover_media_object_id text references public.media_objects (id) on delete set null,
  price_amount_minor    bigint check (price_amount_minor is null or price_amount_minor >= 0),
  currency              text check (currency is null or currency ~ '^[A-Z]{3}$'),
  access_type           public.vault_offer_access not null default 'paid',
  external_url          text,
  inventory_mode        public.vault_inventory_mode not null default 'unlimited',
  inventory_count       integer check (inventory_count is null or inventory_count >= 0),
  status                public.vault_offer_status not null default 'draft',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint creator_products_limited_inventory check (
    inventory_mode <> 'limited' or inventory_count is not null
  ),
  constraint creator_products_access_no_contact check (access_type <> 'contact')
);

create index if not exists creator_products_creator_status_idx
  on public.creator_products (creator_id, status, updated_at desc);

-- ── Courses ─────────────────────────────────────────────────────────────────
create table if not exists public.creator_courses (
  id                    text primary key,
  creator_id            text not null references public.profiles (id) on delete cascade,
  title                 text not null check (char_length(title) between 1 and 80),
  description           text not null default '' check (char_length(description) <= 2000),
  cover_media_object_id text references public.media_objects (id) on delete set null,
  access_type           public.vault_offer_access not null default 'free',
  price_amount_minor    bigint check (price_amount_minor is null or price_amount_minor >= 0),
  currency              text check (currency is null or currency ~ '^[A-Z]{3}$'),
  status                public.vault_offer_status not null default 'draft',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint creator_courses_access_no_contact check (access_type <> 'contact')
);

create index if not exists creator_courses_creator_status_idx
  on public.creator_courses (creator_id, status, updated_at desc);

create table if not exists public.course_lessons (
  id              text primary key,
  course_id       text not null references public.creator_courses (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 80),
  description     text not null default '' check (char_length(description) <= 2000),
  position        integer not null check (position >= 1),
  content_type    public.vault_lesson_content not null default 'text',
  media_object_id text references public.media_objects (id) on delete set null,
  body_text       text not null default '' check (char_length(body_text) <= 8000),
  preview_allowed boolean not null default false,
  access_type     public.vault_offer_access not null default 'free',
  status          public.vault_offer_status not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (course_id, position),
  constraint course_lessons_access_no_contact check (access_type <> 'contact')
);

create index if not exists course_lessons_course_pos_idx
  on public.course_lessons (course_id, position);

create table if not exists public.course_progress (
  profile_id   text not null references public.profiles (id) on delete cascade,
  course_id    text not null references public.creator_courses (id) on delete cascade,
  lesson_id    text not null references public.course_lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (profile_id, lesson_id)
);

create index if not exists course_progress_course_idx
  on public.course_progress (profile_id, course_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.creator_services enable row level security;
alter table public.vault_service_requests enable row level security;
alter table public.creator_products enable row level security;
alter table public.creator_courses enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_progress enable row level security;

revoke all on public.creator_services from public, anon, authenticated;
revoke all on public.vault_service_requests from public, anon, authenticated;
revoke all on public.creator_products from public, anon, authenticated;
revoke all on public.creator_courses from public, anon, authenticated;
revoke all on public.course_lessons from public, anon, authenticated;
revoke all on public.course_progress from public, anon, authenticated;

grant select on public.creator_services to anon, authenticated;
grant select on public.creator_products to anon, authenticated;
grant select on public.creator_courses to anon, authenticated;
grant select on public.course_lessons to anon, authenticated;
grant select on public.course_progress to authenticated;
grant select on public.vault_service_requests to authenticated;

create policy creator_services_select on public.creator_services
  for select using (
    (
      status = 'published'
      and not public.vault_profiles_blocked(public.my_profile_id(), creator_id)
    )
    or creator_id = public.my_profile_id()
  );

create policy creator_products_select on public.creator_products
  for select using (
    (
      status = 'published'
      and not public.vault_profiles_blocked(public.my_profile_id(), creator_id)
    )
    or creator_id = public.my_profile_id()
  );

create policy creator_courses_select on public.creator_courses
  for select using (
    (
      status = 'published'
      and not public.vault_profiles_blocked(public.my_profile_id(), creator_id)
    )
    or creator_id = public.my_profile_id()
  );

create policy course_lessons_select on public.course_lessons
  for select using (
    exists (
      select 1 from public.creator_courses c
       where c.id = course_id
         and (
           c.creator_id = public.my_profile_id()
           or (
             c.status = 'published'
             and course_lessons.status = 'published'
             and not public.vault_profiles_blocked(public.my_profile_id(), c.creator_id)
           )
         )
    )
  );

create policy course_progress_select on public.course_progress
  for select using (profile_id = public.my_profile_id());

create policy vault_service_requests_select on public.vault_service_requests
  for select using (
    requester_id = public.my_profile_id()
    or creator_id = public.my_profile_id()
  );

-- ── Access helpers ──────────────────────────────────────────────────────────
create or replace function public.can_access_course_lesson(p_viewer text, p_lesson_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lesson public.course_lessons%rowtype;
  v_course public.creator_courses%rowtype;
begin
  select * into v_lesson from public.course_lessons where id = p_lesson_id;
  if not found then return false; end if;
  select * into v_course from public.creator_courses where id = v_lesson.course_id;
  if not found then return false; end if;

  if p_viewer is not null and v_course.creator_id = p_viewer then
    return true;
  end if;
  if v_course.status <> 'published' or v_lesson.status <> 'published' then
    return false;
  end if;
  if public.vault_profiles_blocked(p_viewer, v_course.creator_id) then
    return false;
  end if;

  -- Course-level paid without payment entitlement stays locked (except free lessons).
  if v_course.access_type = 'paid' and v_lesson.access_type <> 'free' and not v_lesson.preview_allowed then
    return false;
  end if;
  if v_course.access_type = 'subscriber'
     and v_lesson.access_type <> 'free'
     and not v_lesson.preview_allowed
     and not (p_viewer is not null and public.viewer_has_vault_subscription(v_course.creator_id))
  then
    return false;
  end if;

  if v_lesson.access_type = 'free' then return true; end if;
  if v_lesson.preview_allowed and v_lesson.access_type <> 'paid' then return true; end if;
  if v_lesson.access_type = 'subscriber' then
    return p_viewer is not null and public.viewer_has_vault_subscription(v_course.creator_id);
  end if;
  -- paid lesson: no payment entitlement in 15.1
  return false;
end;
$$;

revoke all on function public.can_access_course_lesson(text, text) from public;
grant execute on function public.can_access_course_lesson(text, text) to anon, authenticated;

create or replace function public.course_lesson_media_target(p_lesson_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lesson public.course_lessons%rowtype;
  v_media  public.media_objects%rowtype;
begin
  if not public.can_access_course_lesson(public.my_profile_id(), p_lesson_id) then
    return null;
  end if;
  select * into v_lesson from public.course_lessons where id = p_lesson_id;
  if not found or v_lesson.media_object_id is null then return null; end if;
  select * into v_media from public.media_objects where id = v_lesson.media_object_id;
  if not found or v_media.status <> 'ready' or v_media.deleted_at is not null then
    return null;
  end if;
  return jsonb_build_object(
    'bucket', v_media.bucket,
    'path', v_media.storage_path,
    'mediaKind', v_media.media_kind
  );
end;
$$;

revoke all on function public.course_lesson_media_target(text) from public;
grant execute on function public.course_lesson_media_target(text) to authenticated;

-- ── Cover media ownership guard ─────────────────────────────────────────────
create or replace function public.vault_assert_owned_public_cover(p_owner text, p_media_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.media_objects%rowtype;
begin
  if p_media_id is null then return; end if;
  select * into v_media from public.media_objects where id = p_media_id;
  if not found then raise exception 'media not found' using errcode = 'P0002'; end if;
  if v_media.owner_id <> p_owner then raise exception 'not your media' using errcode = 'P0001'; end if;
  if v_media.status <> 'ready' then raise exception 'media is not ready' using errcode = 'P0004'; end if;
  if v_media.visibility <> 'public' or v_media.bucket <> 'public-media' then
    raise exception 'cover media must be public' using errcode = 'P0005';
  end if;
end;
$$;

-- ── Service RPCs ────────────────────────────────────────────────────────────
create or replace function public.create_creator_service(
  p_title text,
  p_description text default '',
  p_category public.vault_service_category default 'other',
  p_delivery_type public.vault_service_delivery default 'online',
  p_access_type public.vault_offer_access default 'contact',
  p_price_amount_minor bigint default null,
  p_currency text default null,
  p_cover_media_object_id text default null,
  p_external_url text default null
)
returns public.creator_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  v_url text := nullif(btrim(coalesce(p_external_url, '')), '');
  v_currency text := nullif(upper(btrim(coalesce(p_currency, ''))), '');
  v_row public.creator_services%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform public.assert_rate_limit(v_creator, 'vault_service_create', 20, interval '1 day');
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'invalid title' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 2000 then raise exception 'description too long' using errcode = 'P0003'; end if;
  if v_url is not null and not public.is_allowed_http_url(v_url) then
    raise exception 'external url must be https' using errcode = 'P0005';
  end if;
  if p_access_type = 'paid' and p_price_amount_minor is null and v_url is null then
    raise exception 'paid service needs a price or external url' using errcode = 'P0003';
  end if;
  perform public.vault_assert_owned_public_cover(v_creator, p_cover_media_object_id);

  insert into public.creator_services (
    id, creator_id, title, description, category, cover_media_object_id,
    access_type, price_amount_minor, currency, delivery_type, external_url, status
  ) values (
    'svc_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    v_creator, v_title, v_desc, p_category, p_cover_media_object_id,
    p_access_type, p_price_amount_minor, v_currency, p_delivery_type, v_url, 'draft'
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.update_creator_service(
  p_service_id text,
  p_title text default null,
  p_description text default null,
  p_category public.vault_service_category default null,
  p_delivery_type public.vault_service_delivery default null,
  p_access_type public.vault_offer_access default null,
  p_price_amount_minor bigint default null,
  p_currency text default null,
  p_cover_media_object_id text default null,
  p_external_url text default null,
  p_clear_cover boolean default false,
  p_clear_external_url boolean default false
)
returns public.creator_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row public.creator_services%rowtype;
  v_url text;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select * into v_row from public.creator_services where id = p_service_id and creator_id = v_creator;
  if not found then raise exception 'service not found' using errcode = 'P0002'; end if;

  if p_title is not null then
    if char_length(btrim(p_title)) < 1 or char_length(btrim(p_title)) > 80 then
      raise exception 'invalid title' using errcode = 'P0003';
    end if;
    v_row.title := btrim(p_title);
  end if;
  if p_description is not null then
    if char_length(btrim(p_description)) > 2000 then raise exception 'description too long' using errcode = 'P0003'; end if;
    v_row.description := btrim(p_description);
  end if;
  if p_category is not null then v_row.category := p_category; end if;
  if p_delivery_type is not null then v_row.delivery_type := p_delivery_type; end if;
  if p_access_type is not null then v_row.access_type := p_access_type; end if;
  if p_price_amount_minor is not null then v_row.price_amount_minor := p_price_amount_minor; end if;
  if p_currency is not null then v_row.currency := nullif(upper(btrim(p_currency)), ''); end if;
  if p_clear_cover then
    v_row.cover_media_object_id := null;
  elsif p_cover_media_object_id is not null then
    perform public.vault_assert_owned_public_cover(v_creator, p_cover_media_object_id);
    v_row.cover_media_object_id := p_cover_media_object_id;
  end if;
  if p_clear_external_url then
    v_row.external_url := null;
  elsif p_external_url is not null then
    v_url := nullif(btrim(p_external_url), '');
    if v_url is not null and not public.is_allowed_http_url(v_url) then
      raise exception 'external url must be https' using errcode = 'P0005';
    end if;
    v_row.external_url := v_url;
  end if;

  update public.creator_services set
    title = v_row.title,
    description = v_row.description,
    category = v_row.category,
    delivery_type = v_row.delivery_type,
    access_type = v_row.access_type,
    price_amount_minor = v_row.price_amount_minor,
    currency = v_row.currency,
    cover_media_object_id = v_row.cover_media_object_id,
    external_url = v_row.external_url,
    updated_at = now()
  where id = p_service_id and creator_id = v_creator
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.set_creator_service_status(
  p_service_id text,
  p_status public.vault_offer_status
)
returns public.creator_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row public.creator_services%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  update public.creator_services
     set status = p_status, updated_at = now()
   where id = p_service_id and creator_id = v_creator
  returning * into v_row;
  if not found then raise exception 'service not found' using errcode = 'P0002'; end if;
  return v_row;
end;
$$;

create or replace function public.request_creator_service(
  p_service_id text,
  p_message text
)
returns public.vault_service_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester text := public.my_profile_id();
  v_msg text := btrim(coalesce(p_message, ''));
  v_service public.creator_services%rowtype;
  v_row public.vault_service_requests%rowtype;
begin
  if v_requester is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform public.assert_rate_limit(v_requester, 'vault_service_request', 10, interval '1 hour');
  if char_length(v_msg) < 1 or char_length(v_msg) > 500 then
    raise exception 'message must be 1-500 characters' using errcode = 'P0003';
  end if;
  select * into v_service from public.creator_services where id = p_service_id and status = 'published';
  if not found then raise exception 'service not found' using errcode = 'P0002'; end if;
  if v_service.creator_id = v_requester then
    raise exception 'cannot request your own service' using errcode = 'P0004';
  end if;
  if public.vault_profiles_blocked(v_requester, v_service.creator_id) then
    raise exception 'unavailable' using errcode = 'P0001';
  end if;
  if v_service.access_type = 'subscriber'
     and not public.viewer_has_vault_subscription(v_service.creator_id)
  then
    raise exception 'subscribers only' using errcode = 'P0005';
  end if;

  insert into public.vault_service_requests (
    id, service_id, creator_id, requester_id, message, status
  ) values (
    'srq_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    v_service.id, v_service.creator_id, v_requester, v_msg, 'requested'
  )
  on conflict (service_id, requester_id) do update
    set message = excluded.message,
        status = 'requested',
        updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.set_service_request_status(
  p_request_id text,
  p_status public.vault_service_request_status
)
returns public.vault_service_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.my_profile_id();
  v_row public.vault_service_requests%rowtype;
begin
  if v_actor is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select * into v_row from public.vault_service_requests where id = p_request_id;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;

  if p_status = 'cancelled' then
    if v_row.requester_id <> v_actor then
      raise exception 'only the requester can cancel' using errcode = 'P0001';
    end if;
    if v_row.status not in ('requested', 'accepted') then
      raise exception 'cannot cancel' using errcode = 'P0004';
    end if;
  else
    if v_row.creator_id <> v_actor then
      raise exception 'only the creator can update status' using errcode = 'P0001';
    end if;
    if p_status not in ('accepted', 'declined', 'completed') then
      raise exception 'invalid status' using errcode = 'P0003';
    end if;
  end if;

  update public.vault_service_requests
     set status = p_status, updated_at = now()
   where id = p_request_id
  returning * into v_row;
  return v_row;
end;
$$;
