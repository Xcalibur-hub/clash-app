-- ============================================================================
-- CLASH 2.0 · 0015 — Vault write surface (creator RPCs)
-- ----------------------------------------------------------------------------
-- Every Vault mutation is one SECURITY DEFINER function that resolves the caller
-- from `auth.uid()` through `my_profile_id()`. None of them accepts a creator id,
-- and none trusts a client-supplied timestamp, status or expiry:
--
--   · ownership     → re-checked here AND by the media-rule trigger
--   · status        → only the server moves draft → published → expired/removed
--   · published_at  → stamped by the server
--   · expires_at    → always published_at + 7 days (the table CHECK agrees)
--
-- Client INSERT/UPDATE/DELETE grants on every Vault table were revoked in
-- migration 0014, so these functions are the only way in.
-- ============================================================================

-- ── 1. Vaults ───────────────────────────────────────────────────────────────
/** Open the caller's Vault. One per creator — a second call is an explicit error. */
create or replace function public.create_vault(
  p_title       text,
  p_description text default ''
)
returns public.creator_vaults
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_title   text := trim(p_title);
  v_desc    text := coalesce(trim(p_description), '');
  v_row     public.creator_vaults%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to open a vault' using errcode = '42501';
  end if;
  if v_title = '' or char_length(v_title) > 60 then
    raise exception 'a vault title must be 1-60 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 280 then
    raise exception 'a vault description must be 280 characters or fewer' using errcode = 'P0003';
  end if;

  -- `creator_vaults.creator_id` is UNIQUE, which is the real guard; this check
  -- turns the constraint violation into a legible, typed error.
  if exists (select 1 from public.creator_vaults where creator_id = v_creator) then
    raise exception 'you already have a vault' using errcode = 'P0007';
  end if;

  insert into public.creator_vaults (id, creator_id, title, description, status)
  values (
    'v_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    v_creator, v_title, v_desc, 'active'
  )
  returning * into v_row;

  return v_row;
end;
$$;

/** Edit the caller's Vault. A Vault you do not own is simply "not found". */
create or replace function public.update_vault(
  p_vault_id    text,
  p_title       text,
  p_description text default ''
)
returns public.creator_vaults
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_title   text := trim(p_title);
  v_desc    text := coalesce(trim(p_description), '');
  v_row     public.creator_vaults%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to edit a vault' using errcode = '42501';
  end if;
  if v_title = '' or char_length(v_title) > 60 then
    raise exception 'a vault title must be 1-60 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 280 then
    raise exception 'a vault description must be 280 characters or fewer' using errcode = 'P0003';
  end if;

  update public.creator_vaults
     set title = v_title, description = v_desc, updated_at = now()
   where id = p_vault_id and creator_id = v_creator
  returning * into v_row;

  if not found then
    raise exception 'vault not found or not yours' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- ── 2. Drops ────────────────────────────────────────────────────────────────
/**
 * Create a draft Drop. `create_vault_drop` never publishes: a Drop is only
 * visible to the creator until `publish_vault_drop` stamps its 7-day window.
 *
 * Media is optional at this stage but, when supplied, the media-rule trigger
 * insists it is the creator's own, ready, non-tombstoned object whose bucket
 * matches the access level (private ⇒ subscriber, public ⇒ free).
 */
create or replace function public.create_vault_drop(
  p_vault_id        text,
  p_caption         text,
  p_access_level    public.vault_drop_access,
  p_media_object_id text default null
)
returns public.vault_drops
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_caption text := trim(p_caption);
  v_row     public.vault_drops%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to post a drop' using errcode = '42501';
  end if;
  if v_caption = '' or char_length(v_caption) > 280 then
    raise exception 'a drop caption must be 1-280 characters' using errcode = 'P0003';
  end if;
  if not exists (
    select 1 from public.creator_vaults where id = p_vault_id and creator_id = v_creator
  ) then
    raise exception 'vault not found or not yours' using errcode = 'P0002';
  end if;

  insert into public.vault_drops
    (id, vault_id, creator_id, caption, media_object_id, access_level, status)
  values (
    'vd_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    p_vault_id, v_creator, v_caption, p_media_object_id, p_access_level, 'draft'
  )
  returning * into v_row;

  return v_row;
end;
$$;

/**
 * Publish a draft: the server stamps `published_at` and `expires_at`, so a Drop
 * lives exactly seven days from the moment it goes live. The phone's clock is
 * never consulted, and there is no parameter through which a client could ask
 * for a different window.
 *
 * Idempotent for an already-published Drop; an expired or removed Drop cannot be
 * republished (that would silently revive retracted or archived content).
 */
create or replace function public.publish_vault_drop(p_drop_id text)
returns public.vault_drops
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_row     public.vault_drops%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to publish a drop' using errcode = '42501';
  end if;

  select * into v_row from public.vault_drops where id = p_drop_id;
  if not found then
    raise exception 'drop not found' using errcode = 'P0002';
  end if;
  if v_row.creator_id <> v_creator then
    raise exception 'not your drop' using errcode = 'P0001';
  end if;

  if v_row.status = 'published' then
    return v_row;  -- already live: a repeated publish is a no-op, not an error
  end if;
  if v_row.deleted_at is not null or v_row.status = 'removed' then
    raise exception 'this drop was removed' using errcode = 'P0010';
  end if;
  if v_row.status = 'expired' then
    raise exception 'an expired drop cannot be republished' using errcode = 'P0011';
  end if;
  if v_row.media_object_id is null then
    raise exception 'a drop needs media before publishing' using errcode = 'P0008';
  end if;

  update public.vault_drops
     set status = 'published',
         published_at = now(),
         expires_at = now() + interval '7 days'
   where id = p_drop_id and creator_id = v_creator
  returning * into v_row;

  return v_row;
end;
$$;

/**
 * Retract a Drop. This is a tombstone (`status = 'removed'` + `deleted_at`), not
 * a DELETE: the row, its media reference and any Collection item survive, so a
 * creator-curated Collection keeps its shape. Idempotent.
 */
create or replace function public.delete_vault_drop(p_drop_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
begin
  if v_creator is null then
    raise exception 'sign in to delete a drop' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vault_drops where id = p_drop_id) then
    raise exception 'drop not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.vault_drops where id = p_drop_id and creator_id = v_creator
  ) then
    raise exception 'not your drop' using errcode = 'P0001';
  end if;

  update public.vault_drops
     set status = 'removed', deleted_at = now()
   where id = p_drop_id and creator_id = v_creator and deleted_at is null;
end;
$$;

-- ── 3. Collections ──────────────────────────────────────────────────────────
/**
 * Start a permanent Collection. Deliberately separate from the 7-day feed: a
 * Collection is a curator's shelf, so it has no expiry of its own.
 */
create or replace function public.create_collection(
  p_vault_id    text,
  p_title       text,
  p_description text default ''
)
returns public.vault_collections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_title   text := trim(p_title);
  v_desc    text := coalesce(trim(p_description), '');
  v_row     public.vault_collections%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to start a collection' using errcode = '42501';
  end if;
  if v_title = '' or char_length(v_title) > 80 then
    raise exception 'a collection title must be 1-80 characters' using errcode = 'P0003';
  end if;
  if char_length(v_desc) > 280 then
    raise exception 'a collection description must be 280 characters or fewer' using errcode = 'P0003';
  end if;
  if not exists (
    select 1 from public.creator_vaults where id = p_vault_id and creator_id = v_creator
  ) then
    raise exception 'vault not found or not yours' using errcode = 'P0002';
  end if;

  insert into public.vault_collections (id, vault_id, creator_id, title, description)
  values (
    'vc_' || lower(substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    p_vault_id, v_creator, v_title, v_desc
  )
  returning * into v_row;

  return v_row;
end;
$$;

/**
 * Add one of the creator's own Drops to one of their own Collections.
 *
 * Permitted on purpose for an EXPIRED Drop: that is the whole point of the
 * permanence model — a Drop whose 7-day feed window has closed can still be
 * curated, and once collected it stays readable through the Collection.
 * Idempotent, so a double tap never duplicates a shelf item.
 */
create or replace function public.add_drop_to_collection(
  p_collection_id text,
  p_drop_id       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_col     public.vault_collections%rowtype;
  v_drop    public.vault_drops%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to curate a collection' using errcode = '42501';
  end if;

  select * into v_col from public.vault_collections where id = p_collection_id;
  if not found then
    raise exception 'collection not found' using errcode = 'P0002';
  end if;
  if v_col.creator_id <> v_creator then
    raise exception 'not your collection' using errcode = 'P0001';
  end if;

  select * into v_drop from public.vault_drops where id = p_drop_id;
  if not found then
    raise exception 'drop not found' using errcode = 'P0002';
  end if;
  -- A Collection only ever shelves its own Vault's Drops.
  if v_drop.creator_id <> v_creator or v_drop.vault_id <> v_col.vault_id then
    raise exception 'that drop is not in this vault' using errcode = 'P0001';
  end if;

  insert into public.vault_collection_items (collection_id, drop_id, position)
  values (
    p_collection_id,
    p_drop_id,
    coalesce(
      (select max(i.position) + 1 from public.vault_collection_items i
        where i.collection_id = p_collection_id),
      0
    )
  )
  on conflict (collection_id, drop_id) do nothing;
end;
$$;

/** Take a Drop off a Collection. Idempotent: removing twice is not an error. */
create or replace function public.remove_drop_from_collection(
  p_collection_id text,
  p_drop_id       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator text := public.my_profile_id();
  v_col     public.vault_collections%rowtype;
begin
  if v_creator is null then
    raise exception 'sign in to curate a collection' using errcode = '42501';
  end if;

  select * into v_col from public.vault_collections where id = p_collection_id;
  if not found then
    raise exception 'collection not found' using errcode = 'P0002';
  end if;
  if v_col.creator_id <> v_creator then
    raise exception 'not your collection' using errcode = 'P0001';
  end if;

  delete from public.vault_collection_items
   where collection_id = p_collection_id and drop_id = p_drop_id;
end;
$$;

-- ── 4. Privileges: authenticated creators only, never anon or PUBLIC ─────────
grant execute on function public.create_vault(text, text) to authenticated;
grant execute on function public.update_vault(text, text, text) to authenticated;
grant execute on function public.create_vault_drop(text, text, public.vault_drop_access, text) to authenticated;
grant execute on function public.publish_vault_drop(text) to authenticated;
grant execute on function public.delete_vault_drop(text) to authenticated;
grant execute on function public.create_collection(text, text, text) to authenticated;
grant execute on function public.add_drop_to_collection(text, text) to authenticated;
grant execute on function public.remove_drop_from_collection(text, text) to authenticated;

revoke execute on function public.create_vault(text, text) from public, anon;
revoke execute on function public.update_vault(text, text, text) from public, anon;
revoke execute on function public.create_vault_drop(text, text, public.vault_drop_access, text) from public, anon;
revoke execute on function public.publish_vault_drop(text) from public, anon;
revoke execute on function public.delete_vault_drop(text) from public, anon;
revoke execute on function public.create_collection(text, text, text) from public, anon;
revoke execute on function public.add_drop_to_collection(text, text) from public, anon;
revoke execute on function public.remove_drop_from_collection(text, text) from public, anon;
