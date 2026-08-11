#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.server"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.server.yml"

cd "$PROJECT_ROOT"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${COMPOSE[@]}" exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
\pset pager off

DO $$
DECLARE
  resumo_hist bigint;
  detalhe_hist bigint;
  fraude_hist bigint;
  evento_hist bigint;
  julho_periodos bigint;
  julho_linhas bigint;
  julho_agentes bigint;
BEGIN
  SELECT count(*) INTO resumo_hist
  FROM core.vw_score_resumo_periodo
  WHERE dt_fim_periodo <= DATE '2026-06-30';

  SELECT count(*) INTO detalhe_hist
  FROM core.vw_score_detalhe_descontos
  WHERE dt_fim_periodo <= DATE '2026-06-30';

  SELECT count(*) INTO fraude_hist
  FROM core.vw_score_fraude_motivos
  WHERE dt_fim_periodo <= DATE '2026-06-30';

  SELECT count(*) INTO evento_hist
  FROM core.vw_score_detalhe_evento_item
  WHERE dt_fim_periodo <= DATE '2026-06-30';

  SELECT count(DISTINCT (dt_inicio_periodo, dt_fim_periodo)) INTO julho_periodos
  FROM core.vw_score_resumo_periodo
  WHERE dt_inicio_periodo >= DATE '2026-07-01'
    AND dt_inicio_periodo < DATE '2026-08-01';

  SELECT count(*), count(DISTINCT cd_agente)
    INTO julho_linhas, julho_agentes
  FROM core.vw_score_resumo_periodo
  WHERE dt_inicio_periodo = DATE '2026-07-01'
    AND dt_fim_periodo = DATE '2026-07-31';

  IF resumo_hist <> 167547 THEN RAISE EXCEPTION 'historico resumo Jan-Jun alterado: %', resumo_hist; END IF;
  IF detalhe_hist <> 310210 THEN RAISE EXCEPTION 'historico detalhe Jan-Jun alterado: %', detalhe_hist; END IF;
  IF fraude_hist <> 43 THEN RAISE EXCEPTION 'historico fraude Jan-Jun alterado: %', fraude_hist; END IF;
  IF evento_hist <> 310210 THEN RAISE EXCEPTION 'historico evento Jan-Jun alterado: %', evento_hist; END IF;
  IF julho_periodos <> 1 THEN RAISE EXCEPTION 'julho deve possuir exatamente um periodo, encontrado: %', julho_periodos; END IF;
  IF julho_linhas = 0 THEN RAISE EXCEPTION 'julho nao possui score calculado'; END IF;
  IF julho_linhas <> julho_agentes THEN
    RAISE EXCEPTION 'julho possui linhas duplicadas por agente: linhas %, agentes %', julho_linhas, julho_agentes;
  END IF;
END;
$$;

SELECT
  dt_inicio_periodo,
  dt_fim_periodo,
  count(*) AS linhas,
  count(DISTINCT cd_agente) AS agentes,
  count(*) FILTER (WHERE id_score < 0) AS historicas,
  count(*) FILTER (WHERE id_score > 0) AS operacionais
FROM core.vw_score_resumo_periodo
GROUP BY dt_inicio_periodo, dt_fim_periodo
ORDER BY dt_inicio_periodo;
SQL

echo "[OK] Jan-Jun permanecem intactos e julho esta pronto para o Power BI."
