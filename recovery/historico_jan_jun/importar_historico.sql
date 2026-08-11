\set ON_ERROR_STOP on
\echo '[historico] iniciando importacao'

BEGIN;

DO $$
BEGIN
  IF to_regclass('core.tb_bi_score_resumo_historico') IS NULL THEN
    RAISE EXCEPTION 'Migration de historico nao foi aplicada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM core.tb_score_monitoramento_agente
    WHERE dt_inicio_periodo < DATE '2026-07-01'
  ) THEN
    RAISE EXCEPTION
      'Existem scores operacionais anteriores a 2026-07-01. A importacao foi bloqueada';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM core.tb_bi_score_resumo_historico LIMIT 1)
     OR EXISTS (SELECT 1 FROM core.tb_bi_score_detalhe_descontos_historico LIMIT 1)
     OR EXISTS (SELECT 1 FROM core.tb_bi_score_fraude_motivos_historico LIMIT 1)
     OR EXISTS (SELECT 1 FROM core.tb_bi_score_detalhe_evento_item_historico LIMIT 1) THEN
    RAISE EXCEPTION
      'As tabelas historicas ja possuem dados. A importacao e de execucao unica e foi bloqueada';
  END IF;
END;
$$;

CREATE TEMP TABLE stg_bi_score_resumo (
  id_score text,
  dt_inicio_periodo text,
  dt_fim_periodo text,
  cd_agente text,
  nome text,
  cpf_cnpj text,
  ds_status text,
  ds_esteira_periodo text,
  vl_score_inicial text,
  vl_desc_esteira text,
  vl_desc_documentacao text,
  vl_desc_nuvideo text,
  vl_desc_autorreg text,
  vl_desc_posvenda text,
  vl_desc_fraude text,
  vl_desconto_total text,
  vl_score_final text,
  dt_calculo text,
  periodo_key text
) ON COMMIT DROP;

CREATE TEMP TABLE stg_bi_score_detalhe (
  id_score text,
  dt_inicio_periodo text,
  dt_fim_periodo text,
  cd_agente text,
  nome text,
  tp_evento text,
  tp_regra text,
  id_regra text,
  ds_regra text,
  ds_descricao text,
  qtd_ocorrencias text,
  vl_desconto_aplicado text,
  observacao text,
  periodo_key text
) ON COMMIT DROP;

CREATE TEMP TABLE stg_bi_score_fraude (
  id_score text,
  dt_inicio_periodo text,
  dt_fim_periodo text,
  cd_agente text,
  nome text,
  id_regra text,
  ds_classificacao text,
  ds_motivo text,
  qtd_ocorrencias text,
  periodo_key text
) ON COMMIT DROP;

CREATE TEMP TABLE stg_bi_score_evento_item (
  id_score text,
  dt_inicio_periodo text,
  dt_fim_periodo text,
  cd_agente text,
  nome text,
  tp_evento text,
  qtd_ocorrencias text,
  vl_desconto_aplicado text,
  periodo_key text,
  ds_item_exibido text,
  ds_classificacao text
) ON COMMIT DROP;

\echo '[historico] copiando CSVs para tabelas temporarias'
\copy stg_bi_score_resumo FROM '/tmp/score_historico/vw_score_resumo_periodo.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"', ESCAPE '"', ENCODING 'UTF8')
\copy stg_bi_score_detalhe FROM '/tmp/score_historico/vw_score_detalhe_descontos.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"', ESCAPE '"', ENCODING 'UTF8')
\copy stg_bi_score_fraude FROM '/tmp/score_historico/vw_score_fraude_motivos.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"', ESCAPE '"', ENCODING 'UTF8')
\copy stg_bi_score_evento_item FROM '/tmp/score_historico/core_vw_score_detalhe_evento_item.csv' WITH (FORMAT csv, HEADER true, DELIMITER ';', QUOTE '"', ESCAPE '"', ENCODING 'UTF8')

DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO invalid_count
  FROM stg_bi_score_resumo
  WHERE periodo_key <> left(dt_inicio_periodo, 10) || '|' || left(dt_fim_periodo, 10);

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'Resumo possui % PeriodoKey invalidos', invalid_count;
  END IF;

  SELECT count(*)
  INTO invalid_count
  FROM stg_bi_score_detalhe
  WHERE periodo_key <> left(dt_inicio_periodo, 10) || '|' || left(dt_fim_periodo, 10);

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'Detalhe possui % PeriodoKey invalidos', invalid_count;
  END IF;

  SELECT count(*)
  INTO invalid_count
  FROM stg_bi_score_fraude
  WHERE periodo_key <> left(dt_inicio_periodo, 10) || '|' || left(dt_fim_periodo, 10);

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'Fraude possui % PeriodoKey invalidos', invalid_count;
  END IF;

  SELECT count(*)
  INTO invalid_count
  FROM stg_bi_score_evento_item
  WHERE periodo_key <> left(dt_inicio_periodo, 10) || '|' || left(dt_fim_periodo, 10);

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'Evento item possui % PeriodoKey invalidos', invalid_count;
  END IF;
END;
$$;

\echo '[historico] inserindo resumo'
INSERT INTO core.tb_bi_score_resumo_historico (
  id_score,
  dt_inicio_periodo,
  dt_fim_periodo,
  cd_agente,
  nome,
  cpf_cnpj,
  ds_status,
  ds_esteira_periodo,
  vl_score_inicial,
  vl_desc_esteira,
  vl_desc_documentacao,
  vl_desc_nuvideo,
  vl_desc_autorreg,
  vl_desc_posvenda,
  vl_desc_fraude,
  vl_desconto_total,
  vl_score_final,
  dt_calculo
)
SELECT
  -abs(id_score::bigint),
  left(dt_inicio_periodo, 10)::date,
  left(dt_fim_periodo, 10)::date,
  cd_agente::bigint,
  nome,
  nullif(cpf_cnpj, ''),
  ds_status,
  nullif(ds_esteira_periodo, ''),
  vl_score_inicial::integer,
  vl_desc_esteira::integer,
  vl_desc_documentacao::integer,
  vl_desc_nuvideo::integer,
  vl_desc_autorreg::integer,
  vl_desc_posvenda::integer,
  vl_desc_fraude::integer,
  vl_desconto_total::integer,
  vl_score_final::integer,
  replace(dt_calculo, ',', '.')::timestamp AT TIME ZONE 'UTC'
FROM stg_bi_score_resumo;

\echo '[historico] inserindo detalhe de descontos'
INSERT INTO core.tb_bi_score_detalhe_descontos_historico (
  id_score,
  dt_inicio_periodo,
  dt_fim_periodo,
  cd_agente,
  nome,
  tp_evento,
  tp_regra,
  id_regra,
  ds_regra,
  ds_descricao,
  qtd_ocorrencias,
  vl_desconto_aplicado,
  observacao
)
SELECT
  -abs(id_score::bigint),
  left(dt_inicio_periodo, 10)::date,
  left(dt_fim_periodo, 10)::date,
  cd_agente::bigint,
  nome,
  tp_evento,
  tp_regra,
  id_regra::bigint,
  ds_regra,
  ds_descricao,
  qtd_ocorrencias::integer,
  replace(vl_desconto_aplicado, ',', '.')::integer,
  nullif(observacao, '')
FROM stg_bi_score_detalhe;

\echo '[historico] inserindo motivos de alerta'
INSERT INTO core.tb_bi_score_fraude_motivos_historico (
  id_score,
  dt_inicio_periodo,
  dt_fim_periodo,
  cd_agente,
  nome,
  id_regra,
  ds_classificacao,
  ds_motivo,
  qtd_ocorrencias
)
SELECT
  -abs(id_score::bigint),
  left(dt_inicio_periodo, 10)::date,
  left(dt_fim_periodo, 10)::date,
  cd_agente::bigint,
  nome,
  id_regra::bigint,
  ds_classificacao,
  ds_motivo,
  qtd_ocorrencias::integer
FROM stg_bi_score_fraude;

\echo '[historico] inserindo evento item'
INSERT INTO core.tb_bi_score_detalhe_evento_item_historico (
  id_score,
  dt_inicio_periodo,
  dt_fim_periodo,
  cd_agente,
  nome,
  tp_evento,
  ds_item_exibido,
  qtd_ocorrencias,
  vl_desconto_aplicado,
  ds_classificacao
)
SELECT
  -abs(id_score::bigint),
  left(dt_inicio_periodo, 10)::date,
  left(dt_fim_periodo, 10)::date,
  cd_agente::bigint,
  nome,
  tp_evento,
  ds_item_exibido,
  qtd_ocorrencias::integer,
  replace(vl_desconto_aplicado, ',', '.')::numeric,
  nullif(ds_classificacao, '')
FROM stg_bi_score_evento_item;

DO $$
DECLARE
  resumo_count bigint;
  detalhe_count bigint;
  fraude_count bigint;
  evento_count bigint;
  periodo_count bigint;
  formula_error_count bigint;
  collision_count bigint;
  child_mismatch_count bigint;
BEGIN
  SELECT count(*) INTO resumo_count
  FROM core.tb_bi_score_resumo_historico;

  SELECT count(*) INTO detalhe_count
  FROM core.tb_bi_score_detalhe_descontos_historico;

  SELECT count(*) INTO fraude_count
  FROM core.tb_bi_score_fraude_motivos_historico;

  SELECT count(*) INTO evento_count
  FROM core.tb_bi_score_detalhe_evento_item_historico;

  SELECT count(DISTINCT (dt_inicio_periodo, dt_fim_periodo))
  INTO periodo_count
  FROM core.tb_bi_score_resumo_historico;

  SELECT count(*)
  INTO formula_error_count
  FROM core.tb_bi_score_resumo_historico
  WHERE vl_score_inicial - vl_score_final <> vl_desconto_total
     OR vl_desc_esteira
        + vl_desc_documentacao
        + vl_desc_nuvideo
        + vl_desc_autorreg
        + vl_desc_posvenda
        + vl_desc_fraude
        <> vl_desconto_total;

  SELECT count(*)
  INTO collision_count
  FROM core.tb_bi_score_resumo_historico h
  JOIN core.tb_score_monitoramento_agente s
    ON s.id_score = h.id_score;

  SELECT count(*)
  INTO child_mismatch_count
  FROM (
    SELECT d.id_score
    FROM core.tb_bi_score_detalhe_descontos_historico d
    JOIN core.tb_bi_score_resumo_historico r ON r.id_score = d.id_score
    WHERE d.dt_inicio_periodo <> r.dt_inicio_periodo
       OR d.dt_fim_periodo <> r.dt_fim_periodo
       OR d.cd_agente <> r.cd_agente
       OR d.nome <> r.nome

    UNION ALL

    SELECT f.id_score
    FROM core.tb_bi_score_fraude_motivos_historico f
    JOIN core.tb_bi_score_resumo_historico r ON r.id_score = f.id_score
    WHERE f.dt_inicio_periodo <> r.dt_inicio_periodo
       OR f.dt_fim_periodo <> r.dt_fim_periodo
       OR f.cd_agente <> r.cd_agente
       OR f.nome <> r.nome

    UNION ALL

    SELECT e.id_score
    FROM core.tb_bi_score_detalhe_evento_item_historico e
    JOIN core.tb_bi_score_resumo_historico r ON r.id_score = e.id_score
    WHERE e.dt_inicio_periodo <> r.dt_inicio_periodo
       OR e.dt_fim_periodo <> r.dt_fim_periodo
       OR e.cd_agente <> r.cd_agente
       OR e.nome <> r.nome
  ) inconsistencias_filhos;

  IF resumo_count <> 167547 THEN
    RAISE EXCEPTION 'Resumo: esperado 167547, obtido %', resumo_count;
  END IF;

  IF detalhe_count <> 310210 THEN
    RAISE EXCEPTION 'Detalhe: esperado 310210, obtido %', detalhe_count;
  END IF;

  IF fraude_count <> 43 THEN
    RAISE EXCEPTION 'Fraude: esperado 43, obtido %', fraude_count;
  END IF;

  IF evento_count <> 310210 THEN
    RAISE EXCEPTION 'Evento item: esperado 310210, obtido %', evento_count;
  END IF;

  IF periodo_count <> 6 THEN
    RAISE EXCEPTION 'Periodos: esperado 6, obtido %', periodo_count;
  END IF;

  IF formula_error_count <> 0 THEN
    RAISE EXCEPTION 'Foram encontradas % inconsistencias de score', formula_error_count;
  END IF;

  IF collision_count <> 0 THEN
    RAISE EXCEPTION 'Foram encontradas % colisoes de id_score', collision_count;
  END IF;

  IF child_mismatch_count <> 0 THEN
    RAISE EXCEPTION
      'Foram encontradas % inconsistencias entre resumo e detalhes',
      child_mismatch_count;
  END IF;
END;
$$;

COMMIT;

\echo '[historico] importacao concluida'

SELECT 'resumo_historico' AS objeto, count(*) AS registros
FROM core.tb_bi_score_resumo_historico
UNION ALL
SELECT 'detalhe_historico', count(*)
FROM core.tb_bi_score_detalhe_descontos_historico
UNION ALL
SELECT 'fraude_historico', count(*)
FROM core.tb_bi_score_fraude_motivos_historico
UNION ALL
SELECT 'evento_item_historico', count(*)
FROM core.tb_bi_score_detalhe_evento_item_historico
ORDER BY objeto;

SELECT
  dt_inicio_periodo,
  dt_fim_periodo,
  count(*) AS agentes
FROM core.vw_score_resumo_periodo
GROUP BY dt_inicio_periodo, dt_fim_periodo
ORDER BY dt_inicio_periodo;
