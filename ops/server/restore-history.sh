#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.server"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.server.yml"
DUMP_FILE="$PROJECT_ROOT/recovery/historico_jan_jun/backups/score_monitoramento_com_historico_20260723_144345.dump"
EXPECTED_SHA256="272e66603c5aa1ebb4bceafddaf29040561f0a395912e1ee5e29e07aacff4461"
REMOTE_DUMP="/tmp/score_monitoramento_historico.dump"

cd "$PROJECT_ROOT"

[[ -f "$ENV_FILE" ]] || { echo "[ERRO] arquivo ausente: $ENV_FILE" >&2; exit 1; }
[[ -f "$COMPOSE_FILE" ]] || { echo "[ERRO] arquivo ausente: $COMPOSE_FILE" >&2; exit 1; }
[[ -f "$DUMP_FILE" ]] || { echo "[ERRO] dump historico ausente: $DUMP_FILE" >&2; exit 1; }

ACTUAL_SHA256="$(sha256sum "$DUMP_FILE" | awk '{print $1}')"
if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
  echo "[ERRO] SHA256 do dump historico diverge." >&2
  echo "       esperado: $EXPECTED_SHA256" >&2
  echo "       obtido:   $ACTUAL_SHA256" >&2
  exit 1
fi

echo "[OK] dump historico validado por SHA256"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${COMPOSE[@]}" up -d db

for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T db sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! "${COMPOSE[@]}" exec -T db sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
  echo "[ERRO] PostgreSQL nao ficou pronto dentro do tempo esperado." >&2
  exit 1
fi

HAS_APP_OBJECTS="$("${COMPOSE[@]}" exec -T db sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT CASE WHEN to_regnamespace('"'"'core'"'"') IS NULL AND to_regclass('"'"'public.\"SequelizeMeta\"'"'"') IS NULL THEN 0 ELSE 1 END"' \
  | tr -d '[:space:]')"

if [[ "$HAS_APP_OBJECTS" != "0" ]]; then
  echo "[ERRO] o banco nao esta vazio: schema core ou SequelizeMeta ja existe." >&2
  echo "       O restore foi bloqueado para nao sobrescrever dados existentes." >&2
  exit 1
fi

"${COMPOSE[@]}" cp "$DUMP_FILE" "db:$REMOTE_DUMP"

"${COMPOSE[@]}" exec -T db sh -lc \
  'pg_restore --exit-on-error --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/score_monitoramento_historico.dump'

"${COMPOSE[@]}" exec -T db rm -f "$REMOTE_DUMP"

echo "[OK] restore concluido. Executando validacao do historico..."
"$SCRIPT_DIR/validate-history.sh"
