-- HADES FIXTURE — not part of CLASH.
-- The three stub extension packages (postgis, pgcrypto) are installed into the
-- PostgreSQL server's extension directory by fixtures/install-stubs.sh.
-- This file only asserts they are present, so a misconfigured environment fails
-- loudly instead of silently skipping the DDL that needs them.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'postgis') then
    raise exception 'HADES fixture: postgis stub extension not installed';
  end if;
  if not exists (select 1 from pg_available_extensions where name = 'pgcrypto') then
    raise exception 'HADES fixture: pgcrypto stub extension not installed';
  end if;
end $$;
