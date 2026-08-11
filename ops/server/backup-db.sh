#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.server"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.server.yml"
BACKUP_DIR="${1:-/home/dev/backups/score-admin}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/score_monitoramento_${TIMESTAMP}.dump"
TMP_FILE="/tmp/score_monitoramento_backup.dump"

cd "$PROJECT_ROOT"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${COMPOSE[@]}" exec -T db sh -lc \
  'rm -f /tmp/score_monitoramento_backup.dump && pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/score_monitoramento_backup.dump'

"${COMPOSE[@]}" cp "db:$TMP_FILE" "$BACKUP_FILE"
"${COMPOSE[@]}" exec -T db rm -f "$TMP_FILE"

sha256sum "$BACKUP_FILE" | tee "${BACKUP_FILE}.sha256"
chmod 600 "$BACKUP_FILE" "${BACKUP_FILE}.sha256"

echo "[OK] backup criado: $BACKUP_FILE"
