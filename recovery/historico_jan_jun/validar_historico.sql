\set ON_ERROR_STOP on
\pset pager off

\echo '[validacao] contagens das tabelas historicas'
SELECT 'tb_bi_score_resumo_historico' AS objeto, count(*) AS registros
FROM core.tb_bi_score_resumo_historico
UNION ALL
SELECT 'tb_bi_score_detalhe_descontos_historico', count(*)
FROM core.tb_bi_score_detalhe_descontos_historico
UNION ALL
SELECT 'tb_bi_score_fraude_motivos_historico', count(*)
FROM core.tb_bi_score_fraude_motivos_historico
UNION ALL
SELECT 'tb_bi_score_detalhe_evento_item_historico', count(*)
FROM core.tb_bi_score_detalhe_evento_item_historico
ORDER BY objeto;

\echo '[validacao] periodos na view de resumo'
SELECT
  dt_inicio_periodo,
  dt_fim_periodo,
  count(*) AS agentes,
  min(id_score) AS menor_id_score,
  max(id_score) AS maior_id_score
FROM core.vw_score_resumo_periodo
GROUP BY dt_inicio_periodo, dt_fim_periodo
ORDER BY dt_inicio_periodo;

\echo '[validacao] periodos na dimensao'
SELECT *
FROM core.vw_dim_periodo_score
ORDER BY dt_inicio_periodo;

\echo '[validacao] contagens das views consolidadas'
SELECT 'vw_score_resumo_periodo' AS objeto, count(*) AS registros
FROM core.vw_score_resumo_periodo
UNION ALL
SELECT 'vw_score_detalhe_descontos', count(*)
FROM core.vw_score_detalhe_descontos
UNION ALL
SELECT 'vw_score_fraude_motivos', count(*)
FROM core.vw_score_fraude_motivos
UNION ALL
SELECT 'vw_score_detalhe_evento_item', count(*)
FROM core.vw_score_detalhe_evento_item
ORDER BY objeto;

\echo '[validacao] inconsistencias esperadas em zero'
SELECT
  (
    SELECT count(*)
    FROM core.tb_bi_score_resumo_historico
    WHERE id_score >= 0
  ) AS ids_historicos_nao_negativos,
  (
    SELECT count(*)
    FROM core.tb_bi_score_resumo_historico
    WHERE vl_score_inicial - vl_score_final <> vl_desconto_total
  ) AS formulas_score_invalidas,
  (
    SELECT count(*)
    FROM core.tb_bi_score_resumo_historico h
    JOIN core.tb_score_monitoramento_agente s
      ON s.id_score = h.id_score
  ) AS colisoes_id_score,
  (
    SELECT count(*)
    FROM core.tb_bi_score_detalhe_descontos_historico d
    LEFT JOIN core.tb_bi_score_resumo_historico r
      ON r.id_score = d.id_score
    WHERE r.id_score IS NULL
  ) AS detalhes_orfaos,
  (
    SELECT count(*)
    FROM core.tb_bi_score_fraude_motivos_historico f
    LEFT JOIN core.tb_bi_score_resumo_historico r
      ON r.id_score = f.id_score
    WHERE r.id_score IS NULL
  ) AS motivos_orfaos,
  (
    SELECT count(*)
    FROM core.tb_bi_score_detalhe_evento_item_historico e
    LEFT JOIN core.tb_bi_score_resumo_historico r
      ON r.id_score = e.id_score
    WHERE r.id_score IS NULL
  ) AS eventos_orfaos;

\echo '[validacao] tipos de evento historicos'
SELECT tp_evento, count(*) AS registros
FROM core.tb_bi_score_detalhe_evento_item_historico
GROUP BY tp_evento
ORDER BY registros DESC, tp_evento;
