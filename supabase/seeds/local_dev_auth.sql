-- ============================================================================
-- CLASH · LOCAL developer auth user (LOCAL Docker ONLY)
-- ----------------------------------------------------------------------------
-- Creates a real Auth user so a physical Android device can sign in against
-- local Supabase without using a hosted OTP mailbox.
--
--   email:    dev@clash.local
--   password: clash-local-dev
--
-- Profile row is created by public.handle_new_user() trigger.
-- Not a migration. Never applied by hosted db push.
-- ============================================================================

begin;

do $$
declare
  v_addr inet := inet_server_addr();
  v_uid  uuid := '00000000-0000-4000-a000-0000000000de';
begin
  if v_addr is not null
     and host(v_addr) not in ('127.0.0.1', '::1')
     and host(v_addr) not like '172.%'
     and host(v_addr) not like '10.%'
  then
    raise exception
      'local_dev_auth: refused — server address % is not a local/dev network',
      v_addr;
  end if;

  -- Idempotent: remove previous seeded developer (cascade identities + profile).
  delete from auth.users where id = v_uid or email = 'dev@clash.local';

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid,
    'authenticated',
    'authenticated',
    'dev@clash.local',
    crypt('clash-local-dev', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Local Dev"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_uid,
    jsonb_build_object(
      'sub', v_uid::text,
      'email', 'dev@clash.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_uid::text,
    now(),
    now(),
    now()
  );

  -- Friendly handle for the auto-created profile (trigger already inserted).
  update public.profiles
     set handle = 'local_dev',
         name = 'Local Dev',
         avatar_tint = '#3D8BFF',
         bio = 'Local Docker developer account. Not for production.'
   where auth_user_id = v_uid;
end $$;

commit;

do $$
begin
  raise notice 'local_dev_auth: ready — sign in as dev@clash.local / clash-local-dev';
end $$;
