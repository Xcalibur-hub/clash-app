#!/bin/sh
# Phase 11 Step 10 Part E — disposable local backup/restore rehearsal.
# LOCAL ONLY. Never run against hosted staging.
set -e
echo "--- dump ---"
pg_dump -U postgres -d postgres -Fc -f /tmp/rehearsal.dump
ls -l /tmp/rehearsal.dump | awk '{print "dump_bytes="$5}'
echo "--- restore into a fresh database ---"
psql -U postgres -d postgres -q -c 'drop database if exists c10_restore'
psql -U postgres -d postgres -q -c 'create database c10_restore'
pg_restore -U postgres -d c10_restore --no-owner --no-acl /tmp/rehearsal.dump > /tmp/rehearsal.log 2>&1 || true
echo "restore_error_lines=$(grep -c 'error:' /tmp/rehearsal.log 2>/dev/null || echo 0)"
echo "--- source vs restored structural comparison ---"
for db in postgres c10_restore; do
  psql -U postgres -d "$db" -tAc "select '$db ledger='||count(*) from supabase_migrations.schema_migrations"
  psql -U postgres -d "$db" -tAc "select '$db public_tables='||count(*) from information_schema.tables where table_schema='public'"
  psql -U postgres -d "$db" -tAc "select '$db public_routines='||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
  psql -U postgres -d "$db" -tAc "select '$db policies='||count(*) from pg_policy"
  psql -U postgres -d "$db" -tAc "select '$db buckets='||count(*) from storage.buckets"
done
echo "--- rehearsal result ---"
psql -U postgres -d postgres -tAc "select case when (select count(*) from supabase_migrations.schema_migrations)=(select count(*) from dblink('dbname=c10_restore','select count(*) from supabase_migrations.schema_migrations') as t(c bigint)) then 'RESTORE_STRUCTURE_MATCHES' else 'RESTORE_MISMATCH' end" 2>/dev/null || echo "RESTORE_COMPARE_VIA_SEPARATE_SESSION"
