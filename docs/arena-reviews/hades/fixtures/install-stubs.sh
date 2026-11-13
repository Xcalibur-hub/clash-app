#!/bin/sh
# HADES FIXTURE — installs stub extension packages for a DISPOSABLE PostgreSQL.
# These are NOT the real postgis/pgcrypto extensions and provide no real
# functionality. Run with the server STOPPED, before loading migrations.
set -eu

SHAREDIR="${1:-}"
if [ -z "$SHAREDIR" ]; then
  if command -v pg_config >/dev/null 2>&1; then
    SHAREDIR="$(pg_config --sharedir)"
  else
    echo "usage: $0 <path-to-postgresql-sharedir>" >&2
    echo "  e.g. $0 /usr/share/postgresql/16" >&2
    exit 2
  fi
fi
EXT="$SHAREDIR/extension"
[ -d "$EXT" ] || { echo "no extension directory at $EXT" >&2; exit 2; }

cat > "$EXT/postgis.control" <<'CTL'
# HADES FIXTURE STUB — NOT PostGIS. Declares the extension so migrations load.
comment = 'HADES stub for postgis (fixture only, no geo semantics)'
default_version = '3.0.0'
relocatable = false
CTL

cat > "$EXT/postgis--3.0.0.sql" <<'SQL'
-- HADES FIXTURE STUB — NOT PostGIS. No spatial semantics; adequate only for DDL.
create domain geography as text;
create domain geometry as text;
create function st_makepoint(double precision, double precision) returns geometry
  language sql immutable as $$ select ('POINT(' || $1 || ' ' || $2 || ')')::geometry $$;
create function st_setsrid(geometry, integer) returns geometry
  language sql immutable as $$ select $1 $$;
create function st_x(geometry) returns double precision
  language sql immutable as $$ select split_part(split_part($1::text,'(',2),' ',1)::double precision $$;
create function st_y(geometry) returns double precision
  language sql immutable as $$ select split_part(replace(split_part(split_part($1::text,'(',2),' ',2),')',''),' ',1)::double precision $$;
create function st_geohash(geometry, integer) returns text
  language sql immutable as $$ select md5($1::text) $$;
create function st_distance(geography, geography) returns double precision
  language sql immutable as $$ select 0::double precision $$;
create function st_dwithin(geography, geography, double precision) returns boolean
  language sql immutable as $$ select true $$;
SQL

cat > "$EXT/pgcrypto.control" <<'CTL'
# HADES FIXTURE STUB — NOT pgcrypto. Not cryptographically secure.
comment = 'HADES stub for pgcrypto (fixture only)'
default_version = '1.3'
relocatable = false
CTL

cat > "$EXT/pgcrypto--1.3.sql" <<'SQL'
-- HADES FIXTURE STUB — NOT pgcrypto. Uses md5; NOT cryptographically secure.
create function gen_random_bytes(integer) returns bytea
  language sql volatile as $$ select decode(md5(random()::text), 'hex') $$;
create function digest(bytea, text) returns bytea
  language sql immutable as $$ select decode(md5($1), 'hex') $$;
create function digest(text, text) returns bytea
  language sql immutable as $$ select decode(md5($1), 'hex') $$;
SQL

echo "installed stubs into $EXT"
ls -1 "$EXT"/postgis* "$EXT"/pgcrypto*
