#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.server"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.server.yml"

cd "$PROJECT_ROOT"

[[ -f "$ENV_FILE" ]] || { echo "[ERRO] arquivo ausente: $ENV_FILE" >&2; exit 1; }

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${COMPOSE[@]}" exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
\pset pager off

DO $$
DECLARE
  resumo bigint;
  detalhe bigint;
  fraude bigint;
  evento bigint;
  periodos bigint;
  score_live bigint;
  agentes bigint;
  regras bigint;
  faixas bigint;
  migracoes_criticas bigint;
  triggers_protecao bigint;
BEGIN
  SELECT count(*) INTO resumo FROM core.tb_bi_score_resumo_historico;
  SELECT count(*) INTO detalhe FROM core.tb_bi_score_detalhe_descontos_historico;
  SELECT count(*) INTO fraude FROM core.tb_bi_score_fraude_motivos_historico;
  SELECT count(*) INTO evento FROM core.tb_bi_score_detalhe_evento_item_historico;
  SELECT count(DISTINCT (dt_inicio_periodo, dt_fim_periodo)) INTO periodos
    FROM core.tb_bi_score_resumo_historico;
  SELECT count(*) INTO score_live FROM core.tb_score_monitoramento_agente;
  SELECT count(*) INTO agentes FROM core.tb_agente;
  SELECT count(*) INTO regras FROM core.tb_regra;
  SELECT count(*) INTO faixas FROM core.tb_regra_faixa;

  SELECT count(*) INTO migracoes_criticas
  FROM "SequelizeMeta"
  WHERE name IN (
    '20260723170000-create-bi-historical-recovery.ts',
    '20260723171000-protect-bi-historical-data.ts'
  );

  SELECT count(*) INTO triggers_protecao
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'core'
    AND c.relname LIKE 'tb_bi_%_historico'
    AND NOT t.tgisinternal
    AND t.tgname LIKE 'tr_bloquear_%';

  IF resumo <> 167547 THEN RAISE EXCEPTION 'resumo historico invalido: %', resumo; END IF;
  IF detalhe <> 310210 THEN RAISE EXCEPTION 'detalhe historico invalido: %', detalhe; END IF;
  IF fraude <> 43 THEN RAISE EXCEPTION 'fraude historica invalida: %', fraude; END IF;
  IF evento <> 310210 THEN RAISE EXCEPTION 'evento item historico invalido: %', evento; END IF;
  IF periodos <> 6 THEN RAISE EXCEPTION 'quantidade de periodos historicos invalida: %', periodos; END IF;
  IF score_live <> 0 THEN RAISE EXCEPTION 'score operacional deveria estar vazio apos restore: %', score_live; END IF;
  IF agentes <> 0 THEN RAISE EXCEPTION 'cadastro operacional de agentes deveria estar vazio apos restore: %', agentes; END IF;
  IF regras <> 15 THEN RAISE EXCEPTION 'quantidade de regras inesperada: %', regras; END IF;
  IF faixas <> 54 THEN RAISE EXCEPTION 'quantidade de faixas inesperada: %', faixas; END IF;
  IF migracoes_criticas <> 2 THEN RAISE EXCEPTION 'migrations historicas criticas ausentes: %', migracoes_criticas; END IF;
  IF triggers_protecao <> 8 THEN RAISE EXCEPTION 'triggers de protecao historica inesperadas: %', triggers_protecao; END IF;
END;
$$;

SELECT
  dt_inicio_periodo,
  dt_fim_periodo,
  count(*) AS agentes,
  min(id_score) AS menor_id_score,
  max(id_score) AS maior_id_score
FROM core.vw_score_resumo_periodo
GROUP BY dt_inicio_periodo, dt_fim_periodo
ORDER BY dt_inicio_periodo;

SELECT 'resumo' AS objeto, count(*) AS registros FROM core.vw_score_resumo_periodo
UNION ALL
SELECT 'detalhe', count(*) FROM core.vw_score_detalhe_descontos
UNION ALL
SELECT 'fraude', count(*) FROM core.vw_score_fraude_motivos
UNION ALL
SELECT 'evento_item', count(*) FROM core.vw_score_detalhe_evento_item
ORDER BY objeto;
SQL

echo "[OK] historico Jan-Jun restaurado e protegido com integridade."
