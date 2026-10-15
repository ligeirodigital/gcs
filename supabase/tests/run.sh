#!/usr/bin/env bash
# Executa migrations + testes de autorização em um PostgreSQL temporário (sem Supabase).
# Uso: supabase/tests/run.sh   (precisa de binários do PostgreSQL 14+ e, como root, do usuário "postgres")
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
DIR="$(mktemp -d)"; PORT=54329
RUN=""; if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; RUN="su postgres -c"; fi
as() { if [ -n "$RUN" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
trap 'as "$PGBIN/pg_ctl -D $DIR/data stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
as "$PGBIN/initdb -D $DIR/data -A trust" >/dev/null
as "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start" >/dev/null
PSQL="psql -h $DIR -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
as "$PSQL -f $HERE/stubs.sql" >/dev/null
# tabelas legadas do site da agência existem em produção; as migrations antigas as criam.
for f in "$ROOT"/supabase/migrations/*.sql; do as "$PSQL -f $f" >/dev/null; done
for tf in "$HERE"/*.test.sql; do as "$PSQL -f $tf" 2>&1 | sed -n 's/^psql:.*NOTICE:  //p;s/^NOTICE:  //p;/ERROR/p'; done
