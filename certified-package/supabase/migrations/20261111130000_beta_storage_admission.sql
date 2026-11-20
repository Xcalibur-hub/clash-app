begin;
do $$ begin
  if to_regprocedure('public.guard_beta_take_identity()') is null
     or to_regprocedure('public.assert_release_admission(text)') is null
     or to_regprocedure('public.guard_beta_membership_admission()') is null
     or to_regprocedure('public.my_profile_id()') is null
     or to_regclass('public.media_objects') is null then
    raise exception 'Beta prerequisites missing before Storage admission guard';
  end if;
end $$;

create or replace function public.guard_beta_storage_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('role', true), '');
  v_raw_op text := coalesce(current_setting('storage.operation', true), '');
  v_op text := case
    when v_raw_op like 'storage.%' then substr(v_raw_op, 9)
    else v_raw_op
  end;
  v_is_signed_client boolean := v_op in (
    'object.upload_signed',
    'tus.upload.create_signed',
    'tus.upload.part_signed',
    'tus.upload.create/sign',
    'tus.upload.part/sign'
  );
  v_actor_uid uuid;
  v_media public.media_objects%rowtype;
  v_expected_visibility public.media_visibility;
begin
  -- Trusted SQL superuser / migration / non-signed service_role writers remain outside API admission.
  if v_role not in ('anon', 'authenticated') and not v_is_signed_client then
    return new;
  end if;

  if v_role = 'anon' then
    raise exception 'Sign in to upload media' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Storage object updates and overwrites are denied' using errcode = '42501';
  end if;

  if v_role = 'authenticated' then
    v_actor_uid := auth.uid();
  else
    v_actor_uid := new.owner;
  end if;

  if v_actor_uid is null
     or new.owner is distinct from v_actor_uid
     or (new.owner_id is not null and new.owner_id is distinct from v_actor_uid::text) then
    raise exception 'Storage upload actor mismatch' using errcode = '42501';
  end if;

  if new.bucket_id not in ('public-media', 'private-media')
     or new.name is null
     or btrim(new.name) = '' then
    raise exception 'Unsupported storage upload target' using errcode = '42501';
  end if;

  v_expected_visibility := case
    when new.bucket_id = 'public-media' then 'public'::public.media_visibility
    else 'private'::public.media_visibility
  end;

  select m.* into v_media
    from public.media_objects m
    join public.profiles p on p.id = m.owner_id
   where m.bucket = new.bucket_id
     and m.storage_path = new.name
     and p.auth_user_id = v_actor_uid
     and m.status = 'uploading'::public.media_status
     and m.deleted_at is null
     and m.created_at > clock_timestamp() - interval '24 hours'
     and m.visibility = v_expected_visibility
   order by m.created_at desc, m.id desc
   limit 1
   for share of m;

  if not found then
    raise exception 'Storage upload requires an active uploading media_objects admission record' using errcode = '42501';
  end if;

  return new;
end $$;

revoke all on function public.guard_beta_storage_upload() from public, anon, authenticated, service_role;

do $storage$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage.objects absent (local pre-storage reset; enforced via 00_storage_bootstrap.sql)';
    return;
  end if;

  -- Fail loudly (never silent no-op) if executor lacks ownership on managed storage.objects.
  execute 'drop policy if exists "media upload into own namespace" on storage.objects';
  execute 'drop policy if exists "admitted media upload only" on storage.objects';
  execute $p$
    create policy "admitted media upload only"
      on storage.objects for insert to authenticated
      with check (
        bucket_id in ('public-media', 'private-media')
        and owner = auth.uid()
        and (owner_id is null or owner_id = auth.uid()::text)
        and public.my_profile_id() is not null
        and exists (
          select 1
            from public.media_objects m
           where m.owner_id = public.my_profile_id()
             and m.bucket = bucket_id
             and m.storage_path = name
             and m.status = 'uploading'::public.media_status
             and m.deleted_at is null
             and m.created_at > clock_timestamp() - interval '24 hours'
             and m.visibility = case
               when bucket_id = 'public-media' then 'public'::public.media_visibility
               else 'private'::public.media_visibility
             end
        )
      )
  $p$;

  execute 'drop policy if exists "own media objects are updatable" on storage.objects';

  execute 'drop trigger if exists beta_storage_upload_admission on storage.objects';
  execute $t$
    create trigger beta_storage_upload_admission
      before insert or update on storage.objects
      for each row execute function public.guard_beta_storage_upload()
  $t$;
end $storage$;
commit;
