-- ============================================================================
-- CLASH 2.0 · Phase 15.2 — Creator Communities write + read surface (RPCs)
-- ----------------------------------------------------------------------------
-- Every mutation is one SECURITY DEFINER function that resolves the caller from
-- `auth.uid()` through `my_profile_id()`. None accepts an author id, and none
-- trusts a client-supplied status, type or identity:
--
--   · authorship    → always the signed-in profile
--   · type          → announcements are creator/staff only
--   · pseudonymity  → only when the community allows it, and never for
--                     announcements; the real `author_profile_id` is always kept
--   · media         → an existing finished PUBLIC upload the author owns
--   · status        → only the server moves visible → hidden/deleted
--
-- Public payloads therefore never carry a real profile id for a pseudonymous
-- author, while moderation still sees the row through `report_target` /
-- `moderation_actions`.
-- ============================================================================

-- ── 1. Card builders (private; the only place identity is projected) ─────────
create or replace function public.vault_community_post_card(p_post_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer  text := public.my_profile_id();
  v_post    public.vault_community_posts%rowtype;
  v_comm    public.vault_communities%rowtype;
  v_author  public.profiles%rowtype;
  v_alias   text;
  v_pseudo  boolean;
  v_media   jsonb;
  v_tint    text;
  v_palette text[] := array[
    '#C45C26', '#2F6FED', '#B45AD4', '#2E7D6F', '#B6862C', '#5B54C4', '#C43B57', '#3E7A3E'
  ];
  v_replies integer;
begin
  select * into v_post from public.vault_community_posts where id = p_post_id;
  if not found then
    return null;
  end if;
  select * into v_comm from public.vault_communities where id = v_post.community_id;
  select * into v_author from public.profiles where id = v_post.author_profile_id;
  v_pseudo := v_post.pseudonymous and v_comm.pseudonymous_enabled;

  select count(*)::integer into v_replies
    from public.vault_community_replies r
   where r.post_id = v_post.id and r.status = 'visible';

  select case
    when m.id is not null
     and m.bucket = 'public-media'
     and m.visibility = 'public'
     and m.status = 'ready'
     and m.deleted_at is null
    then jsonb_build_object('bucket', m.bucket, 'path', m.storage_path, 'kind', m.media_kind)
    else null
  end into v_media
    from public.media_objects m
   where m.id = v_post.media_object_id;

  if v_pseudo then
    v_alias := coalesce(
      (select nullif(btrim(mm.alias), '')
         from public.vault_community_memberships mm
        where mm.community_id = v_post.community_id
          and mm.profile_id = v_post.author_profile_id),
      public.vault_community_alias(v_post.community_id, v_post.author_profile_id)
    );
    v_tint := v_palette[
      (public.vault_community_seed(v_post.community_id, v_post.author_profile_id)
        % array_length(v_palette, 1))::integer + 1
    ];
  end if;

  return jsonb_build_object(
    'id', v_post.id,
    'communityId', v_post.community_id,
    'type', v_post.post_type,
    'body', v_post.body,
    'createdAt', v_post.created_at,
    'updatedAt', v_post.updated_at,
    'replyCount', v_replies,
    'pseudonymous', v_pseudo,
    'authorId', case when v_pseudo then null else v_author.id end,
    'authorName', case when v_pseudo then v_alias else v_author.name end,
    'authorHandle', case when v_pseudo then null else v_author.handle end,
    'authorTint', case when v_pseudo then v_tint else v_author.avatar_tint end,
    'media', v_media,
    'status', v_post.status,
    'isMine', (v_viewer is not null and v_viewer = v_post.author_profile_id),
    'canDelete', (
      v_post.status <> 'deleted' and (
        (v_viewer is not null and v_viewer = v_post.author_profile_id)
        or public.is_staff()
        or (v_viewer is not null and v_viewer = v_comm.creator_id)
      )
    ),
    'canModerate', (v_viewer is not null and (v_viewer = v_comm.creator_id or public.is_staff()))
  );
end;
$$;

create or replace function public.vault_community_reply_card(p_reply_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_reply  public.vault_community_replies%rowtype;
  v_comm   public.vault_communities%rowtype;
  v_author public.profiles%rowtype;
  v_alias  text;
  v_pseudo boolean;
  v_tint   text;
  v_palette text[] := array[
    '#C45C26', '#2F6FED', '#B45AD4', '#2E7D6F', '#B6862C', '#5B54C4', '#C43B57', '#3E7A3E'
  ];
begin
  select * into v_reply from public.vault_community_replies where id = p_reply_id;
  if not found then
    return null;
  end if;
  select * into v_comm from public.vault_communities where id = v_reply.community_id;
  select * into v_author from public.profiles where id = v_reply.author_profile_id;
  v_pseudo := v_reply.pseudonymous and v_comm.pseudonymous_enabled;

  if v_pseudo then
    v_alias := coalesce(
      (select nullif(btrim(mm.alias), '')
         from public.vault_community_memberships mm
        where mm.community_id = v_reply.community_id
          and mm.profile_id = v_reply.author_profile_id),
      public.vault_community_alias(v_reply.community_id, v_reply.author_profile_id)
    );
    v_tint := v_palette[
      (public.vault_community_seed(v_reply.community_id, v_reply.author_profile_id)
        % array_length(v_palette, 1))::integer + 1
    ];
  end if;

  return jsonb_build_object(
    'id', v_reply.id,
    'postId', v_reply.post_id,
    'communityId', v_reply.community_id,
    'parentReplyId', v_reply.parent_reply_id,
    'body', v_reply.body,
    'createdAt', v_reply.created_at,
    'pseudonymous', v_pseudo,
    'authorId', case when v_pseudo then null else v_author.id end,
    'authorName', case when v_pseudo then v_alias else v_author.name end,
    'authorHandle', case when v_pseudo then null else v_author.handle end,
    'authorTint', case when v_pseudo then v_tint else v_author.avatar_tint end,
    'status', v_reply.status,
    'isMine', (v_viewer is not null and v_viewer = v_reply.author_profile_id),
    'canDelete', (
      v_reply.status <> 'deleted' and (
        (v_viewer is not null and v_viewer = v_reply.author_profile_id)
        or public.is_staff()
        or (v_viewer is not null and v_viewer = v_comm.creator_id)
      )
    ),
    'canModerate', (v_viewer is not null and (v_viewer = v_comm.creator_id or public.is_staff()))
  );
end;
$$;

-- ── 2. Membership touch (join state + scoped alias + last-seen) ──────────────
create or replace function public.vault_community_touch(p_community_id text, p_profile_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pseudo boolean;
  v_alias  text;
begin
  select pseudonymous_enabled into v_pseudo
    from public.vault_communities where id = p_community_id;
  if not found then
    return;
  end if;
  v_alias := case when v_pseudo then public.vault_community_alias(p_community_id, p_profile_id) end;

  insert into public.vault_community_memberships
    (community_id, profile_id, alias, joined_at, last_seen_at)
  values (p_community_id, p_profile_id, v_alias, now(), now())
  on conflict (community_id, profile_id) do update
     set last_seen_at = now(),
         alias        = coalesce(public.vault_community_memberships.alias, excluded.alias);
end;
$$;

-- ── 3. Summary (Vault card + community home header) ─────────────────────────
create or replace function public.vault_community_summary(p_community_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_comm   public.vault_communities%rowtype;
  v_can    boolean;
  v_is_owner boolean;
  v_members integer;
  v_active integer;
  v_alias  text;
  v_icon   jsonb;
  v_ann    jsonb;
  v_ann_id text;
begin
  select * into v_comm from public.vault_communities where id = p_community_id;
  if not found then
    return null;
  end if;

  v_is_owner := (v_viewer is not null and v_viewer = v_comm.creator_id);
  v_can := public.vault_community_viewer_can_access(v_viewer, p_community_id);

  -- A disabled room disappears for everyone but its creator and staff.
  if v_comm.status <> 'active' and not v_is_owner and not public.is_staff() then
    return null;
  end if;

  select count(*)::integer into v_members
    from public.vault_community_memberships m where m.community_id = p_community_id;
  select count(*)::integer into v_active
    from public.vault_community_memberships m
   where m.community_id = p_community_id
     and m.last_seen_at > now() - interval '1 day';

  select case
    when m.id is not null
     and m.bucket = 'public-media'
     and m.visibility = 'public'
     and m.status = 'ready'
     and m.deleted_at is null
    then jsonb_build_object('bucket', m.bucket, 'path', m.storage_path, 'kind', m.media_kind)
    else null
  end into v_icon
    from public.media_objects m where m.id = v_comm.icon_media_object_id;

  select id into v_ann_id
    from public.vault_community_posts p
   where p.community_id = p_community_id
     and p.post_type = 'announcement'
     and p.status = 'visible'
   order by p.created_at desc, p.id desc
   limit 1;
  if v_ann_id is not null and v_can then
    v_ann := public.vault_community_post_card(v_ann_id);
  end if;

  if v_viewer is not null and v_comm.pseudonymous_enabled then
    v_alias := coalesce(
      (select nullif(btrim(mm.alias), '')
         from public.vault_community_memberships mm
        where mm.community_id = p_community_id and mm.profile_id = v_viewer),
      public.vault_community_alias(p_community_id, v_viewer)
    );
  end if;

  return jsonb_build_object(
    'id', v_comm.id,
    'creatorId', v_comm.creator_id,
    'name', v_comm.name,
    'description', v_comm.description,
    'accessType', v_comm.access_type,
    'status', v_comm.status,
    'pseudonymousEnabled', v_comm.pseudonymous_enabled,
    'rules', v_comm.rules,
    'iconMedia', v_icon,
    'memberCount', v_members,
    'activeToday', v_active,
    'viewerAccess', v_can,
    'viewerIsCreator', v_is_owner,
    'viewerIsMember', exists (
      select 1 from public.vault_community_memberships mm
       where mm.community_id = p_community_id
         and mm.profile_id = v_viewer
    ),
    'viewerCanPost', v_can,
    'viewerCanAnnounce', (v_is_owner or public.is_staff()),
    'viewerCanModerate', (v_is_owner or public.is_staff()),
    'viewerPseudonym', v_alias,
    'latestAnnouncement', v_ann
  );
end;
$$;

-- A creator's community, by creator id (used by the Creator World chapter).
create or replace function public.vault_community_for_creator(p_creator_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  select id into v_id from public.vault_communities where creator_id = p_creator_id;
  if v_id is null then
    return null;
  end if;
  return public.vault_community_summary(v_id);
end;
$$;

-- ── 4. Enter (records membership + last-seen, returns the summary) ───────────
create or replace function public.enter_vault_community(p_community_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
begin
  if v_viewer is null then
    raise exception 'sign in to enter a community' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vault_communities where id = p_community_id) then
    raise exception 'community not found' using errcode = 'P0002';
  end if;
  if not public.vault_community_viewer_can_access(v_viewer, p_community_id) then
    raise exception 'you do not have access to this community' using errcode = 'P0005';
  end if;

  perform public.vault_community_touch(p_community_id, v_viewer);
  return public.vault_community_summary(p_community_id);
end;
$$;

-- ── 5. Feeds (paginated, bounded, stable order) ─────────────────────────────
create or replace function public.list_vault_community_posts(
  p_community_id      text,
  p_limit             integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id         text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_limit  integer := greatest(1, least(coalesce(p_limit, 20), 40));
begin
  if not public.vault_community_viewer_can_access(v_viewer, p_community_id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.vault_community_post_card(q.id) order by q.created_at desc, q.id desc)
      from (
        select p.id, p.created_at
          from public.vault_community_posts p
         where p.community_id = p_community_id
           and p.status = 'visible'
           and p.post_type = 'discussion'
           and (
             p_before_created_at is null
             or p.created_at < p_before_created_at
             or (p.created_at = p_before_created_at and (p_before_id is null or p.id < p_before_id))
           )
         order by p.created_at desc, p.id desc
         limit v_limit
      ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_vault_community_replies(
  p_post_id text,
  p_limit   integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer text := public.my_profile_id();
  v_comm   text;
begin
  select community_id into v_comm from public.vault_community_posts where id = p_post_id;
  if v_comm is null or not public.vault_community_viewer_can_access(v_viewer, v_comm) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.vault_community_reply_card(r.id) order by r.created_at asc, r.id asc)
      from (
        select id, created_at
          from public.vault_community_replies
         where post_id = p_post_id and status = 'visible'
         order by created_at asc, id asc
         limit greatest(1, least(coalesce(p_limit, 50), 100))
      ) r
  ), '[]'::jsonb);
end;
$$;

-- ── 6. Writes ───────────────────────────────────────────────────────────────
create or replace function public.create_vault_community_post(
  p_community_id    text,
  p_post_type       public.vault_community_post_type,
  p_body            text,
  p_media_object_id text default null,
  p_pseudonymous    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  text := public.my_profile_id();
  v_comm   public.vault_communities%rowtype;
  v_body   text := btrim(coalesce(p_body, ''));
  v_pseudo boolean;
  v_id     text;
begin
  if v_actor is null then
    raise exception 'sign in to post' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_actor, 'community_post', 20, interval '10 minutes');

  select * into v_comm from public.vault_communities where id = p_community_id;
  if not found then
    raise exception 'community not found' using errcode = 'P0002';
  end if;
  if not public.vault_community_viewer_can_access(v_actor, p_community_id) then
    raise exception 'you do not have access to this community' using errcode = 'P0005';
  end if;
  if v_comm.status <> 'active' then
    raise exception 'this community is closed' using errcode = 'P0004';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'a post must be 1-2000 characters' using errcode = 'P0003';
  end if;

  if p_post_type = 'announcement' then
    if v_actor <> v_comm.creator_id and not public.is_staff() then
      raise exception 'only the creator can post announcements' using errcode = 'P0001';
    end if;
    v_pseudo := false;
  else
    v_pseudo := coalesce(p_pseudonymous, false) and v_comm.pseudonymous_enabled;
  end if;

  if p_media_object_id is not null and not exists (
    select 1 from public.media_objects m
     where m.id = p_media_object_id
       and m.owner_id = v_actor
       and m.bucket = 'public-media'
       and m.visibility = 'public'
       and m.status = 'ready'
       and m.deleted_at is null
  ) then
    raise exception 'attachment must be a finished public upload you own' using errcode = 'P0003';
  end if;

  v_id := 'cpst_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16));
  insert into public.vault_community_posts
    (id, community_id, author_profile_id, post_type, body, media_object_id, pseudonymous)
  values (v_id, p_community_id, v_actor, p_post_type, v_body, p_media_object_id, v_pseudo);

  perform public.vault_community_touch(p_community_id, v_actor);
  return public.vault_community_post_card(v_id);
end;
$$;

create or replace function public.create_vault_community_reply(
  p_post_id         text,
  p_body            text,
  p_parent_reply_id text default null,
  p_pseudonymous    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  text := public.my_profile_id();
  v_post   public.vault_community_posts%rowtype;
  v_comm   public.vault_communities%rowtype;
  v_parent public.vault_community_replies%rowtype;
  v_body   text := btrim(coalesce(p_body, ''));
  v_pseudo boolean;
  v_id     text;
begin
  if v_actor is null then
    raise exception 'sign in to reply' using errcode = '42501';
  end if;
  perform public.assert_rate_limit(v_actor, 'community_reply', 60, interval '10 minutes');

  select * into v_post from public.vault_community_posts where id = p_post_id;
  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  if v_post.status <> 'visible' then
    raise exception 'this post is not open for replies' using errcode = 'P0004';
  end if;
  select * into v_comm from public.vault_communities where id = v_post.community_id;
  if not public.vault_community_viewer_can_access(v_actor, v_post.community_id) then
    raise exception 'you do not have access to this community' using errcode = 'P0005';
  end if;
  if v_comm.status <> 'active' then
    raise exception 'this community is closed' using errcode = 'P0004';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'a reply must be 1-1000 characters' using errcode = 'P0003';
  end if;

  if p_parent_reply_id is not null then
    select * into v_parent from public.vault_community_replies where id = p_parent_reply_id;
    if not found or v_parent.post_id <> p_post_id then
      raise exception 'that reply is not on this post' using errcode = 'P0002';
    end if;
    if v_parent.parent_reply_id is not null then
      raise exception 'replies are two levels deep at most' using errcode = 'P0003';
    end if;
  end if;

  v_pseudo := coalesce(p_pseudonymous, false) and v_comm.pseudonymous_enabled;

  v_id := 'crpl_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16));
  insert into public.vault_community_replies
    (id, post_id, community_id, author_profile_id, parent_reply_id, body, pseudonymous)
  values (v_id, p_post_id, v_post.community_id, v_actor, p_parent_reply_id, v_body, v_pseudo);

  perform public.vault_community_touch(v_post.community_id, v_actor);
  return public.vault_community_reply_card(v_id);
end;
$$;

-- ── 7. Self-removal + creator moderation (tombstones, never a hard delete) ──
create or replace function public.delete_vault_community_post(p_post_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.my_profile_id();
  v_post  public.vault_community_posts%rowtype;
  v_owner text;
begin
  if v_actor is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into v_post from public.vault_community_posts where id = p_post_id;
  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  select creator_id into v_owner from public.vault_communities where id = v_post.community_id;
  if v_actor <> v_post.author_profile_id and v_actor <> v_owner and not public.is_staff() then
    raise exception 'only the author or the creator can remove this' using errcode = 'P0001';
  end if;

  update public.vault_community_posts
     set status = 'deleted', deleted_at = now(), updated_at = now()
   where id = p_post_id;
end;
$$;

create or replace function public.delete_vault_community_reply(p_reply_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.my_profile_id();
  v_reply public.vault_community_replies%rowtype;
  v_owner text;
begin
  if v_actor is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into v_reply from public.vault_community_replies where id = p_reply_id;
  if not found then
    raise exception 'reply not found' using errcode = 'P0002';
  end if;
  select creator_id into v_owner from public.vault_communities where id = v_reply.community_id;
  if v_actor <> v_reply.author_profile_id and v_actor <> v_owner and not public.is_staff() then
    raise exception 'only the author or the creator can remove this' using errcode = 'P0001';
  end if;

  update public.vault_community_replies
     set status = 'deleted', deleted_at = now(), updated_at = now()
   where id = p_reply_id;
end;
$$;

create or replace function public.hide_vault_community_post(p_post_id text, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := public.my_profile_id();
  v_post  public.vault_community_posts%rowtype;
  v_owner text;
begin
  if v_actor is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into v_post from public.vault_community_posts where id = p_post_id;
  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;
  select creator_id into v_owner from public.vault_communities where id = v_post.community_id;
  if v_actor <> v_owner and not public.is_staff() then
    raise exception 'only the creator can moderate this community' using errcode = 'P0001';
  end if;
  if v_post.status = 'deleted' then
    raise exception 'a removed post cannot be hidden' using errcode = 'P0004';
  end if;

  update public.vault_community_posts
     set status = (case when p_hidden then 'hidden' else 'visible' end)::public.vault_community_content_status,
         updated_at = now()
   where id = p_post_id;
end;
$$;

-- ── 8. Creator settings (Creator Studio) ────────────────────────────────────
create or replace function public.create_vault_community(
  p_name                 text,
  p_description          text default '',
  p_access_type          public.vault_community_access default 'public',
  p_pseudonymous_enabled boolean default false,
  p_rules                text default '',
  p_icon_media_object_id text default null
)
returns public.vault_communities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_vault   text;
  v_name    text := btrim(coalesce(p_name, ''));
  v_desc    text := btrim(coalesce(p_description, ''));
  v_rules   text := btrim(coalesce(p_rules, ''));
  v_row     public.vault_communities%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to open a community' using errcode = '42501';
  end if;
  if v_name = '' or char_length(v_name) > 60 then
    raise exception 'a community name must be 1-60 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 280 then
    raise exception 'a description must be 280 characters or fewer' using errcode = 'P0003';
  end if;
  if char_length(v_rules) > 1000 then
    raise exception 'rules must be 1000 characters or fewer' using errcode = 'P0003';
  end if;

  -- A community lives inside the creator's world, so a Vault must exist.
  select id into v_vault from public.creator_vaults where creator_id = v_creator;
  if v_vault is null then
    raise exception 'open your vault before a community' using errcode = 'P0006';
  end if;
  if exists (select 1 from public.vault_communities where creator_id = v_creator) then
    raise exception 'you already have a community' using errcode = 'P0007';
  end if;

  insert into public.vault_communities
    (id, creator_id, vault_id, name, description, access_type,
     pseudonymous_enabled, rules, icon_media_object_id)
  values (
    'cmt_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    v_creator, v_vault, v_name, v_desc, p_access_type,
    coalesce(p_pseudonymous_enabled, false), v_rules, p_icon_media_object_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_vault_community(
  p_community_id         text,
  p_name                 text,
  p_description          text default '',
  p_access_type          public.vault_community_access default 'public',
  p_pseudonymous_enabled boolean default false,
  p_rules                text default '',
  p_icon_media_object_id text default null
)
returns public.vault_communities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_name    text := btrim(coalesce(p_name, ''));
  v_desc    text := btrim(coalesce(p_description, ''));
  v_rules   text := btrim(coalesce(p_rules, ''));
  v_row     public.vault_communities%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to edit a community' using errcode = '42501';
  end if;
  if v_name = '' or char_length(v_name) > 60 then
    raise exception 'a community name must be 1-60 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 280 then
    raise exception 'a description must be 280 characters or fewer' using errcode = 'P0003';
  end if;
  if char_length(v_rules) > 1000 then
    raise exception 'rules must be 1000 characters or fewer' using errcode = 'P0003';
  end if;

  update public.vault_communities
     set name = v_name,
         description = v_desc,
         access_type = p_access_type,
         pseudonymous_enabled = coalesce(p_pseudonymous_enabled, false),
         rules = v_rules,
         icon_media_object_id = p_icon_media_object_id,
         updated_at = now()
   where id = p_community_id and creator_id = v_creator
  returning * into v_row;
  if not found then
    raise exception 'community not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

create or replace function public.set_vault_community_status(
  p_community_id text,
  p_status       public.vault_community_status
)
returns public.vault_communities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row     public.vault_communities%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to change a community' using errcode = '42501';
  end if;
  update public.vault_communities
     set status = p_status, updated_at = now()
   where id = p_community_id and creator_id = v_creator
  returning * into v_row;
  if not found then
    raise exception 'community not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- ── 9. Notifications (server-written; reuses `vault_notify`) ─────────────────
-- Announcements fan out to members (bounded); replies notify the post author and
-- the parent-reply author. A blocked pair is always skipped, and self-notifies
-- never happen — so no notification spam and no cross-block leakage.
create or replace function public.notify_vault_community_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_author   text;
  v_parent_author text;
begin
  select author_profile_id into v_post_author
    from public.vault_community_posts where id = new.post_id;

  if v_post_author is not null
     and v_post_author <> new.author_profile_id
     and not public.vault_profiles_blocked(new.author_profile_id, v_post_author)
  then
    perform public.vault_notify(v_post_author, new.author_profile_id, 'community_reply', 'community_reply', new.id);
  end if;

  if new.parent_reply_id is not null then
    select author_profile_id into v_parent_author
      from public.vault_community_replies where id = new.parent_reply_id;
    if v_parent_author is not null
       and v_parent_author <> new.author_profile_id
       and v_parent_author is distinct from v_post_author
       and not public.vault_profiles_blocked(new.author_profile_id, v_parent_author)
    then
      perform public.vault_notify(v_parent_author, new.author_profile_id, 'community_reply', 'community_reply', new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists vault_community_replies_notify on public.vault_community_replies;
create trigger vault_community_replies_notify
  after insert on public.vault_community_replies
  for each row execute function public.notify_vault_community_reply();

create or replace function public.notify_vault_community_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
begin
  if new.post_type <> 'announcement' or new.status <> 'visible' then
    return new;
  end if;

  for v_member in
    select m.profile_id
      from public.vault_community_memberships m
     where m.community_id = new.community_id
       and m.profile_id <> new.author_profile_id
       and not public.vault_profiles_blocked(new.author_profile_id, m.profile_id)
     order by m.joined_at
     limit 500
  loop
    perform public.vault_notify(v_member.profile_id, new.author_profile_id, 'community_announcement', 'community_post', new.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists vault_community_posts_notify on public.vault_community_posts;
create trigger vault_community_posts_notify
  after insert on public.vault_community_posts
  for each row execute function public.notify_vault_community_announcement();

-- ── 10. Privileges ──────────────────────────────────────────────────────────
grant execute on function public.vault_community_summary(text) to authenticated;
grant execute on function public.vault_community_for_creator(text) to authenticated;
grant execute on function public.enter_vault_community(text) to authenticated;
grant execute on function public.list_vault_community_posts(text, integer, timestamptz, text) to authenticated;
grant execute on function public.list_vault_community_replies(text, integer) to authenticated;
grant execute on function public.create_vault_community_post(text, public.vault_community_post_type, text, text, boolean) to authenticated;
grant execute on function public.create_vault_community_reply(text, text, text, boolean) to authenticated;
grant execute on function public.delete_vault_community_post(text) to authenticated;
grant execute on function public.delete_vault_community_reply(text) to authenticated;
grant execute on function public.hide_vault_community_post(text, boolean) to authenticated;
grant execute on function public.create_vault_community(text, text, public.vault_community_access, boolean, text, text) to authenticated;
grant execute on function public.update_vault_community(text, text, text, public.vault_community_access, boolean, text, text) to authenticated;
grant execute on function public.set_vault_community_status(text, public.vault_community_status) to authenticated;

revoke execute on function public.vault_community_summary(text) from public, anon;
revoke execute on function public.vault_community_for_creator(text) from public, anon;
revoke execute on function public.enter_vault_community(text) from public, anon;
revoke execute on function public.list_vault_community_posts(text, integer, timestamptz, text) from public, anon;
revoke execute on function public.list_vault_community_replies(text, integer) from public, anon;
revoke execute on function public.create_vault_community_post(text, public.vault_community_post_type, text, text, boolean) from public, anon;
revoke execute on function public.create_vault_community_reply(text, text, text, boolean) from public, anon;
revoke execute on function public.delete_vault_community_post(text) from public, anon;
revoke execute on function public.delete_vault_community_reply(text) from public, anon;
revoke execute on function public.hide_vault_community_post(text, boolean) from public, anon;
revoke execute on function public.create_vault_community(text, text, public.vault_community_access, boolean, text, text) from public, anon;
revoke execute on function public.update_vault_community(text, text, text, public.vault_community_access, boolean, text, text) from public, anon;
revoke execute on function public.set_vault_community_status(text, public.vault_community_status) from public, anon;

-- Internal projectors + trigger helpers: never callable by a client.
revoke execute on function public.vault_community_post_card(text) from public, anon, authenticated;
revoke execute on function public.vault_community_reply_card(text) from public, anon, authenticated;
revoke execute on function public.vault_community_touch(text, text) from public, anon, authenticated;
revoke execute on function public.notify_vault_community_reply() from public, anon, authenticated;
revoke execute on function public.notify_vault_community_announcement() from public, anon, authenticated;
