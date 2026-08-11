#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

NETWORK_NAME="score_admin_net"
NETWORK_SUBNET="172.30.250.0/28"
NETWORK_GATEWAY="172.30.250.1"
VOLUMES=(score_pgdata score_minio_data)

cd "$PROJECT_ROOT"

"$SCRIPT_DIR/preflight.sh"

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  docker network create \
    --driver bridge \
    --subnet "$NETWORK_SUBNET" \
    --gateway "$NETWORK_GATEWAY" \
    --label score-admin.managed=true \
    "$NETWORK_NAME" >/dev/null
  echo "[OK] rede criada: ${NETWORK_NAME} (${NETWORK_SUBNET})"
else
  echo "[OK] rede ja existente preservada: ${NETWORK_NAME}"
fi

for volume in "${VOLUMES[@]}"; do
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    docker volume create --label score-admin.managed=true "$volume" >/dev/null
    echo "[OK] volume criado: ${volume}"
  else
    echo "[OK] volume ja existente preservado: ${volume}"
  fi
done

echo "[OK] infraestrutura externa pronta."
