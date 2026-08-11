#!/usr/bin/env bash
set -euo pipefail

SERVER_BIND_IP="192.168.1.115"
NETWORK_NAME="score_admin_net"
NETWORK_SUBNET="172.30.250.0/28"
EXPECTED_GATEWAY="172.30.250.1"
PORTS=(3001 3002 5430 9000 9001)

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[ERRO] comando obrigatorio ausente: $1" >&2
    exit 1
  }
}

for cmd in docker ip ss python3; do
  require_command "$cmd"
done

if ! ip -4 addr show | grep -qE "inet ${SERVER_BIND_IP//./\.}/"; then
  echo "[ERRO] IP ${SERVER_BIND_IP} nao esta configurado neste servidor." >&2
  exit 1
fi

echo "[OK] IP fixo encontrado: ${SERVER_BIND_IP}"

if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  EXISTING_SUBNET="$(docker network inspect "$NETWORK_NAME" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')"
  EXISTING_GATEWAY="$(docker network inspect "$NETWORK_NAME" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')"

  if [[ "$EXISTING_SUBNET" != "$NETWORK_SUBNET" || "$EXISTING_GATEWAY" != "$EXPECTED_GATEWAY" ]]; then
    echo "[ERRO] rede ${NETWORK_NAME} ja existe com configuracao diferente." >&2
    echo "       atual: subnet=${EXISTING_SUBNET} gateway=${EXISTING_GATEWAY}" >&2
    echo "       esperada: subnet=${NETWORK_SUBNET} gateway=${EXPECTED_GATEWAY}" >&2
    exit 1
  fi

  echo "[OK] rede ${NETWORK_NAME} ja existe com subnet correta ${NETWORK_SUBNET}"
else
  TARGET_SUBNET="$NETWORK_SUBNET" python3 <<'PY'
import ipaddress
import json
import os
import subprocess
import sys

target = ipaddress.ip_network(os.environ["TARGET_SUBNET"])

def fail(message: str) -> None:
    print(f"[ERRO] {message}", file=sys.stderr)
    sys.exit(1)

network_ids = subprocess.check_output(
    ["docker", "network", "ls", "-q"], text=True
).split()

for network_id in network_ids:
    data = json.loads(
        subprocess.check_output(["docker", "network", "inspect", network_id], text=True)
    )[0]
    name = data.get("Name", network_id)
    for cfg in data.get("IPAM", {}).get("Config", []) or []:
        subnet = cfg.get("Subnet")
        if not subnet:
            continue
        try:
            existing = ipaddress.ip_network(subnet, strict=False)
        except ValueError:
            continue
        if target.overlaps(existing):
            fail(f"subnet {target} conflita com rede Docker {name}: {existing}")

routes = json.loads(
    subprocess.check_output(
        ["ip", "-j", "-4", "route", "show", "table", "all"], text=True
    )
)

for route in routes:
    dst = route.get("dst")
    if not dst or dst == "default":
        continue
    try:
        existing = ipaddress.ip_network(dst, strict=False)
    except ValueError:
        continue
    if target.overlaps(existing):
        fail(f"subnet {target} conflita com rota do host: {existing}")

print(f"[OK] subnet {target} nao conflita com redes Docker nem rotas atuais")
PY
fi

for port in "${PORTS[@]}"; do
  if ss -H -lnt | awk '{print $4}' | grep -Eq "(^|:)$port$"; then
    echo "[ERRO] porta TCP ${port} ja esta em uso." >&2
    ss -lntp | grep -E "(^|:)${port}[[:space:]]" || true
    exit 1
  fi
  echo "[OK] porta ${port} livre"
done

echo "[OK] preflight concluido. Nenhuma alteracao foi feita no servidor."
