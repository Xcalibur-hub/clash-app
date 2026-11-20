-- ============================================================================
-- CLASH · Phase 15.1 — product / course RPCs + grants (continues vault_commerce)
-- ============================================================================

-- ── Products ────────────────────────────────────────────────────────────────
create or replace function public.create_creator_product(
  p_title text,
  p_description text default '',
  p_product_type public.vault_product_type default 'digital',
  p_access_type public.vault_offer_access default 'paid',
  p_price_amount_minor bigint default null,
  p_currency text default null,
  p_cover_media_object_id text default null,
  p_external_url text default null,
  p_inventory_mode public.vault_inventory_mode default 'unlimited',
  p_inventory_count integer default null
)
returns public.creator_products
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
  v_count integer := p_inventory_count;
  v_row public.creator_products%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform public.assert_rate_limit(v_creator, 'vault_product_create', 30, interval '1 day');
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'invalid title' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 2000 then raise exception 'description too long' using errcode = 'P0003'; end if;
  if p_access_type = 'contact' then raise exception 'invalid access' using errcode = 'P0003'; end if;
  if v_url is not null and not public.is_allowed_http_url(v_url) then
    raise exception 'external url must be https' using errcode = 'P0005';
  end if;
  if p_inventory_mode = 'limited' then
    if v_count is null or v_count < 0 then
      raise exception 'limited inventory requires a non-negative count' using errcode = 'P0003';
    end if;
  else
    v_count := null;
  end if;
  perform public.vault_assert_owned_public_cover(v_creator, p_cover_media_object_id);

  insert into public.creator_products (
    id, creator_id, title, description, product_type, cover_media_object_id,
    price_amount_minor, currency, access_type, external_url, inventory_mode, inventory_count, status
  ) values (
    'prd_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    v_creator, v_title, v_desc, p_product_type, p_cover_media_object_id,
    p_price_amount_minor, v_currency, p_access_type, v_url, p_inventory_mode, v_count, 'draft'
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.update_creator_product(
  p_product_id text,
  p_title text default null,
  p_description text default null,
  p_product_type public.vault_product_type default null,
  p_access_type public.vault_offer_access default null,
  p_price_amount_minor bigint default null,
  p_currency text default null,
  p_cover_media_object_id text default null,
  p_external_url text default null,
  p_inventory_mode public.vault_inventory_mode default null,
  p_inventory_count integer default null,
  p_clear_cover boolean default false,
  p_clear_external_url boolean default false
)
returns public.creator_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row public.creator_products%rowtype;
  v_url text;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select * into v_row from public.creator_products where id = p_product_id and creator_id = v_creator;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;

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
  if p_product_type is not null then v_row.product_type := p_product_type; end if;
  if p_access_type is not null then
    if p_access_type = 'contact' then raise exception 'invalid access' using errcode = 'P0003'; end if;
    v_row.access_type := p_access_type;
  end if;
  if p_price_amount_minor is not null then v_row.price_amount_minor := p_price_amount_minor; end if;
  if p_currency is not null then v_row.currency := nullif(upper(btrim(p_currency)), ''); end if;
  if p_inventory_mode is not null then v_row.inventory_mode := p_inventory_mode; end if;
  if p_inventory_count is not null then
    if p_inventory_count < 0 then raise exception 'inventory cannot be negative' using errcode = 'P0003'; end if;
    v_row.inventory_count := p_inventory_count;
  end if;
  if v_row.inventory_mode = 'limited' and v_row.inventory_count is null then
    raise exception 'limited inventory requires a count' using errcode = 'P0003';
  end if;
  if v_row.inventory_mode <> 'limited' then v_row.inventory_count := null; end if;
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

  update public.creator_products set
    title = v_row.title,
    description = v_row.description,
    product_type = v_row.product_type,
    access_type = v_row.access_type,
    price_amount_minor = v_row.price_amount_minor,
    currency = v_row.currency,
    cover_media_object_id = v_row.cover_media_object_id,
    external_url = v_row.external_url,
    inventory_mode = v_row.inventory_mode,
    inventory_count = v_row.inventory_count,
    updated_at = now()
  where id = p_product_id and creator_id = v_creator
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.set_creator_product_status(
  p_product_id text,
  p_status public.vault_offer_status
)
returns public.creator_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row public.creator_products%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  update public.creator_products
     set status = p_status, updated_at = now()
   where id = p_product_id and creator_id = v_creator
  returning * into v_row;
  if not found then raise exception 'product not found' using errcode = 'P0002'; end if;
  return v_row;
end;
$$;

-- ── Courses ─────────────────────────────────────────────────────────────────
create or replace function public.create_creator_course(
  p_title text,
  p_description text default '',
  p_access_type public.vault_offer_access default 'free',
  p_price_amount_minor bigint default null,
  p_currency text default null,
  p_cover_media_object_id text default null
)
returns public.creator_courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  v_currency text := nullif(upper(btrim(coalesce(p_currency, ''))), '');
  v_row public.creator_courses%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform public.assert_rate_limit(v_creator, 'vault_course_create', 20, interval '1 day');
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'invalid title' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 2000 then raise exception 'description too long' using errcode = 'P0003'; end if;
  if p_access_type = 'contact' then raise exception 'invalid access' using errcode = 'P0003'; end if;
  perform public.vault_assert_owned_public_cover(v_creator, p_cover_media_object_id);

  insert into public.creator_courses (
    id, creator_id, title, description, cover_media_object_id,
    access_type, price_amount_minor, currency, status
  ) values (
    'crs_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    v_creator, v_title, v_desc, p_cover_media_object_id,
    p_access_type, p_price_amount_minor, v_currency, 'draft'
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.update_creator_course(
  p_course_id text,
  p_title text default null,
  p_description text default null,
  p_access_type public.vault_offer_access default null,
  p_price_amount_minor bigint default null,
  p_currency text default null,
  p_cover_media_object_id text default null,
  p_clear_cover boolean default false
)
returns public.creator_courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row public.creator_courses%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select * into v_row from public.creator_courses where id = p_course_id and creator_id = v_creator;
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;

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
  if p_access_type is not null then
    if p_access_type = 'contact' then raise exception 'invalid access' using errcode = 'P0003'; end if;
    v_row.access_type := p_access_type;
  end if;
  if p_price_amount_minor is not null then v_row.price_amount_minor := p_price_amount_minor; end if;
  if p_currency is not null then v_row.currency := nullif(upper(btrim(p_currency)), ''); end if;
  if p_clear_cover then
    v_row.cover_media_object_id := null;
  elsif p_cover_media_object_id is not null then
    perform public.vault_assert_owned_public_cover(v_creator, p_cover_media_object_id);
    v_row.cover_media_object_id := p_cover_media_object_id;
  end if;

  update public.creator_courses set
    title = v_row.title,
    description = v_row.description,
    access_type = v_row.access_type,
    price_amount_minor = v_row.price_amount_minor,
    currency = v_row.currency,
    cover_media_object_id = v_row.cover_media_object_id,
    updated_at = now()
  where id = p_course_id and creator_id = v_creator
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.set_creator_course_status(
  p_course_id text,
  p_status public.vault_offer_status
)
returns public.creator_courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row public.creator_courses%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  update public.creator_courses
     set status = p_status, updated_at = now()
   where id = p_course_id and creator_id = v_creator
  returning * into v_row;
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;
  return v_row;
end;
$$;

create or replace function public.create_course_lesson(
  p_course_id text,
  p_title text,
  p_description text default '',
  p_content_type public.vault_lesson_content default 'text',
  p_body_text text default '',
  p_media_object_id text default null,
  p_access_type public.vault_offer_access default 'free',
  p_preview_allowed boolean default false
)
returns public.course_lessons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_course public.creator_courses%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  v_body text := btrim(coalesce(p_body_text, ''));
  v_pos integer;
  v_media public.media_objects%rowtype;
  v_row public.course_lessons%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform public.assert_rate_limit(v_creator, 'vault_lesson_create', 60, interval '1 day');
  select * into v_course from public.creator_courses where id = p_course_id and creator_id = v_creator;
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'invalid title' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 2000 or char_length(v_body) > 8000 then
    raise exception 'content too long' using errcode = 'P0003';
  end if;
  if p_access_type = 'contact' then raise exception 'invalid access' using errcode = 'P0003'; end if;

  if p_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_media_object_id;
    if not found then raise exception 'media not found' using errcode = 'P0002'; end if;
    if v_media.owner_id <> v_creator then raise exception 'not your media' using errcode = 'P0001'; end if;
    if v_media.status <> 'ready' then raise exception 'media is not ready' using errcode = 'P0004'; end if;
    -- free/preview lessons must use public media; subscriber/paid may use private
    if p_access_type = 'free' or p_preview_allowed then
      if v_media.visibility <> 'public' or v_media.bucket <> 'public-media' then
        raise exception 'free/preview lesson media must be public' using errcode = 'P0005';
      end if;
    end if;
  end if;

  select coalesce(max(position), 0) + 1 into v_pos from public.course_lessons where course_id = p_course_id;

  insert into public.course_lessons (
    id, course_id, title, description, position, content_type, media_object_id,
    body_text, preview_allowed, access_type, status
  ) values (
    'lsn_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    p_course_id, v_title, v_desc, v_pos, p_content_type, p_media_object_id,
    v_body, coalesce(p_preview_allowed, false), p_access_type, 'draft'
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.update_course_lesson(
  p_lesson_id text,
  p_title text default null,
  p_description text default null,
  p_body_text text default null,
  p_content_type public.vault_lesson_content default null,
  p_media_object_id text default null,
  p_access_type public.vault_offer_access default null,
  p_preview_allowed boolean default null,
  p_clear_media boolean default false
)
returns public.course_lessons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_lesson public.course_lessons%rowtype;
  v_course public.creator_courses%rowtype;
  v_media public.media_objects%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  perform public.assert_rate_limit(v_creator, 'vault_lesson_update', 120, interval '1 day');
  select * into v_lesson from public.course_lessons where id = p_lesson_id;
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  select * into v_course from public.creator_courses where id = v_lesson.course_id and creator_id = v_creator;
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;

  if p_title is not null then
    if char_length(btrim(p_title)) < 1 or char_length(btrim(p_title)) > 80 then
      raise exception 'invalid title' using errcode = 'P0003';
    end if;
    v_lesson.title := btrim(p_title);
  end if;
  if p_description is not null then v_lesson.description := btrim(p_description); end if;
  if p_body_text is not null then
    if char_length(btrim(p_body_text)) > 8000 then raise exception 'content too long' using errcode = 'P0003'; end if;
    v_lesson.body_text := btrim(p_body_text);
  end if;
  if p_content_type is not null then v_lesson.content_type := p_content_type; end if;
  if p_access_type is not null then
    if p_access_type = 'contact' then raise exception 'invalid access' using errcode = 'P0003'; end if;
    v_lesson.access_type := p_access_type;
  end if;
  if p_preview_allowed is not null then v_lesson.preview_allowed := p_preview_allowed; end if;
  if p_clear_media then
    v_lesson.media_object_id := null;
  elsif p_media_object_id is not null then
    select * into v_media from public.media_objects where id = p_media_object_id;
    if not found then raise exception 'media not found' using errcode = 'P0002'; end if;
    if v_media.owner_id <> v_creator then raise exception 'not your media' using errcode = 'P0001'; end if;
    if v_media.status <> 'ready' then raise exception 'media is not ready' using errcode = 'P0004'; end if;
    if v_lesson.access_type = 'free' or v_lesson.preview_allowed then
      if v_media.visibility <> 'public' or v_media.bucket <> 'public-media' then
        raise exception 'free/preview lesson media must be public' using errcode = 'P0005';
      end if;
    end if;
    v_lesson.media_object_id := p_media_object_id;
  end if;

  update public.course_lessons set
    title = v_lesson.title,
    description = v_lesson.description,
    body_text = v_lesson.body_text,
    content_type = v_lesson.content_type,
    media_object_id = v_lesson.media_object_id,
    access_type = v_lesson.access_type,
    preview_allowed = v_lesson.preview_allowed,
    updated_at = now()
  where id = p_lesson_id
  returning * into v_lesson;
  return v_lesson;
end;
$$;

create or replace function public.set_course_lesson_status(
  p_lesson_id text,
  p_status public.vault_offer_status
)
returns public.course_lessons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_lesson public.course_lessons%rowtype;
begin
  if v_creator is null then raise exception 'sign in required' using errcode = '42501'; end if;
  update public.course_lessons l
     set status = p_status, updated_at = now()
   from public.creator_courses c
  where l.id = p_lesson_id
    and l.course_id = c.id
    and c.creator_id = v_creator
  returning l.* into v_lesson;
  if not found then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  return v_lesson;
end;
$$;

create or replace function public.complete_course_lesson(p_lesson_id text)
returns public.course_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_lesson public.course_lessons%rowtype;
  v_row public.course_progress%rowtype;
begin
  if v_viewer is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if not public.can_access_course_lesson(v_viewer, p_lesson_id) then
    raise exception 'lesson not accessible' using errcode = 'P0005';
  end if;
  select * into v_lesson from public.course_lessons where id = p_lesson_id;
  insert into public.course_progress (profile_id, course_id, lesson_id, completed_at)
  values (v_viewer, v_lesson.course_id, p_lesson_id, now())
  on conflict (profile_id, lesson_id) do update
    set completed_at = excluded.completed_at
  returning * into v_row;
  return v_row;
end;
$$;

-- Lesson card for consumers (no private media paths).
create or replace function public.course_lesson_card(p_lesson_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lesson public.course_lessons%rowtype;
  v_course public.creator_courses%rowtype;
  v_accessible boolean;
  v_public jsonb;
begin
  select * into v_lesson from public.course_lessons where id = p_lesson_id;
  if not found then return null; end if;
  select * into v_course from public.creator_courses where id = v_lesson.course_id;
  if not found then return null; end if;
  if v_course.creator_id <> public.my_profile_id()
     and (v_course.status <> 'published' or v_lesson.status <> 'published')
  then
    return null;
  end if;
  if public.vault_profiles_blocked(public.my_profile_id(), v_course.creator_id) then
    return null;
  end if;

  v_accessible := public.can_access_course_lesson(public.my_profile_id(), p_lesson_id);
  -- Public cover only — never private paths. Preview may show intentional public teaser.
  v_public := null;
  if v_lesson.media_object_id is not null and (v_accessible or v_lesson.preview_allowed) then
    v_public := public.vault_public_cover(v_lesson.media_object_id);
  end if;

  return jsonb_build_object(
    'id', v_lesson.id,
    'courseId', v_lesson.course_id,
    'creatorId', v_course.creator_id,
    'title', v_lesson.title,
    'description', v_lesson.description,
    'position', v_lesson.position,
    'contentType', v_lesson.content_type,
    'accessType', v_lesson.access_type,
    'previewAllowed', v_lesson.preview_allowed,
    'status', v_lesson.status,
    'accessible', v_accessible,
    'bodyText', case when v_accessible then v_lesson.body_text else '' end,
    'publicMedia', v_public,
    'hasPrivateMedia', v_accessible and v_lesson.media_object_id is not null and v_public is null
  );
end;
$$;

-- Grants
revoke all on function public.create_creator_service(text, text, public.vault_service_category, public.vault_service_delivery, public.vault_offer_access, bigint, text, text, text) from public;
grant execute on function public.create_creator_service(text, text, public.vault_service_category, public.vault_service_delivery, public.vault_offer_access, bigint, text, text, text) to authenticated;
revoke all on function public.update_creator_service(text, text, text, public.vault_service_category, public.vault_service_delivery, public.vault_offer_access, bigint, text, text, text, boolean, boolean) from public;
grant execute on function public.update_creator_service(text, text, text, public.vault_service_category, public.vault_service_delivery, public.vault_offer_access, bigint, text, text, text, boolean, boolean) to authenticated;
revoke all on function public.set_creator_service_status(text, public.vault_offer_status) from public;
grant execute on function public.set_creator_service_status(text, public.vault_offer_status) to authenticated;
revoke all on function public.request_creator_service(text, text) from public;
grant execute on function public.request_creator_service(text, text) to authenticated;
revoke all on function public.set_service_request_status(text, public.vault_service_request_status) from public;
grant execute on function public.set_service_request_status(text, public.vault_service_request_status) to authenticated;

revoke all on function public.create_creator_product(text, text, public.vault_product_type, public.vault_offer_access, bigint, text, text, text, public.vault_inventory_mode, integer) from public;
grant execute on function public.create_creator_product(text, text, public.vault_product_type, public.vault_offer_access, bigint, text, text, text, public.vault_inventory_mode, integer) to authenticated;
revoke all on function public.update_creator_product(text, text, text, public.vault_product_type, public.vault_offer_access, bigint, text, text, text, public.vault_inventory_mode, integer, boolean, boolean) from public;
grant execute on function public.update_creator_product(text, text, text, public.vault_product_type, public.vault_offer_access, bigint, text, text, text, public.vault_inventory_mode, integer, boolean, boolean) to authenticated;
revoke all on function public.set_creator_product_status(text, public.vault_offer_status) from public;
grant execute on function public.set_creator_product_status(text, public.vault_offer_status) to authenticated;

revoke all on function public.create_creator_course(text, text, public.vault_offer_access, bigint, text, text) from public;
grant execute on function public.create_creator_course(text, text, public.vault_offer_access, bigint, text, text) to authenticated;
revoke all on function public.update_creator_course(text, text, text, public.vault_offer_access, bigint, text, text, boolean) from public;
grant execute on function public.update_creator_course(text, text, text, public.vault_offer_access, bigint, text, text, boolean) to authenticated;
revoke all on function public.set_creator_course_status(text, public.vault_offer_status) from public;
grant execute on function public.set_creator_course_status(text, public.vault_offer_status) to authenticated;
revoke all on function public.create_course_lesson(text, text, text, public.vault_lesson_content, text, text, public.vault_offer_access, boolean) from public;
grant execute on function public.create_course_lesson(text, text, text, public.vault_lesson_content, text, text, public.vault_offer_access, boolean) to authenticated;
revoke all on function public.update_course_lesson(text, text, text, text, public.vault_lesson_content, text, public.vault_offer_access, boolean, boolean) from public;
grant execute on function public.update_course_lesson(text, text, text, text, public.vault_lesson_content, text, public.vault_offer_access, boolean, boolean) to authenticated;
revoke all on function public.set_course_lesson_status(text, public.vault_offer_status) from public;
grant execute on function public.set_course_lesson_status(text, public.vault_offer_status) to authenticated;
revoke all on function public.complete_course_lesson(text) from public;
grant execute on function public.complete_course_lesson(text) to authenticated;
revoke all on function public.course_lesson_card(text) from public;
grant execute on function public.course_lesson_card(text) to anon, authenticated;

-- Also grant service RPCs from first migration (idempotent)
revoke all on function public.vault_assert_owned_public_cover(text, text) from public;
