#!/bin/sh
set -eu
# Exact CLI 2.40.7 PG17 postinit templates; image performs managed bootstrap.
cat /bootstrap/vendor/schema.sql /bootstrap/vendor/webhook.sql /bootstrap/vendor/_supabase.sql > /etc/postgresql.schema.sql
printf '%s\n' "$PGSODIUM_ROOT_KEY" > /etc/postgresql-custom/pgsodium_root.key
exec docker-entrypoint.sh postgres -D /etc/postgresql -c 'search_path=$user,public,extensions'
