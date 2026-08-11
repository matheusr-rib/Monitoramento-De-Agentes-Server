import type { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
CREATE OR REPLACE PROCEDURE core.sp_calcular_score_periodo(IN p_dt_inicio date, IN p_dt_fim date)
LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_dummy int;
BEGIN
  DELETE FROM core.tb_score_monitoramento_fraude_motivo fm
  USING core.tb_score_monitoramento_agente s
  WHERE fm.id_score = s.id_score
    AND s.dt_inicio_periodo = p_dt_inicio
    AND s.dt_fim_periodo = p_dt_fim;

  DELETE FROM core.tb_score_monitoramento_detalhe d
  USING core.tb_score_monitoramento_agente s
  WHERE d.id_score = s.id_score
    AND s.dt_inicio_periodo = p_dt_inicio
    AND s.dt_fim_periodo = p_dt_fim;

  DELETE FROM core.tb_score_monitoramento_agente s
  WHERE s.dt_inicio_periodo = p_dt_inicio
    AND s.dt_fim_periodo = p_dt_fim;

  WITH agentes AS (
    SELECT a.cd_agente
    FROM core.tb_agente a
  ),
  esteira_atual AS (
    SELECT x.cd_agente, x.ds_esteira
    FROM (
      SELECT
        e.cd_agente,
        e.ds_esteira,
        ROW_NUMBER() OVER (
          PARTITION BY e.cd_agente
          ORDER BY e.dt_atualizacao DESC NULLS LAST, e.id_esteira_agente DESC
        ) AS rn
      FROM core.tb_esteira e
    ) x
    WHERE x.rn = 1
  ),
  posvenda_cnt AS (
    SELECT
      p.cd_agente,
      unaccent(upper(p.ds_motivo)) AS chave_norm,
      COUNT(*)::int AS qtd
    FROM core.tb_posvenda p
    WHERE p.dt_evento::date BETWEEN p_dt_inicio AND p_dt_fim
      AND p.ds_motivo IS NOT NULL
    GROUP BY p.cd_agente, unaccent(upper(p.ds_motivo))
  ),
  nuvideo_cnt AS (
    SELECT
      n.cd_agente,
      unaccent(upper(n.ds_tag)) AS chave_norm,
      COUNT(*)::int AS qtd
    FROM core.tb_nuvideo n
    WHERE n.dt_evento::date BETWEEN p_dt_inicio AND p_dt_fim
      AND n.ds_tag IS NOT NULL
    GROUP BY n.cd_agente, unaccent(upper(n.ds_tag))
  ),
  autorreg_cnt AS (
    SELECT
      ar.cd_agente,
      unaccent(upper('AUTORREGULAÇÃO')) AS chave_norm,
      COUNT(*)::int AS qtd
    FROM core.tb_autorregulacao ar
    WHERE ar.dt_evento::date BETWEEN p_dt_inicio AND p_dt_fim
      AND ar.houve_violacao = true
    GROUP BY ar.cd_agente
  ),
  fraude_base AS (
    SELECT
      f.cd_agente,
      f.ds_motivo,
      unaccent(upper(
        CASE
          WHEN unaccent(upper(f.ds_motivo)) IN (
            unaccent(upper('DESCONHECIMENTO DA OPERAÇÃO')),
            unaccent(upper('CANCELAMENTO RECLAMAÇÃO CLIENTE')),
            unaccent(upper('REVISE ATUAÇÃO AGENTE VENDEDOR DIFERENTE DO AGENTE QUE NEGOCIOU')),
            unaccent(upper('RECLAMAÇÃO')),
            unaccent(upper('CLIENTE SOLICITA CONTATO')),
            unaccent(upper('VOLUME CONSULTAS ROBÔ')),
            unaccent(upper('REVISE ATUAÇÃO QTD MAXIMA DE DIGITAÇÃO ESTRAPOLADA POR LOGIN')),
            unaccent(upper('INFORMAÇÃO CONFIRMAÇÃO OPERAÇÃO')),
            unaccent(upper('POLITICA INTERNA')),
            unaccent(upper('REVISE ATUAÇÃO DIGITAÇÕES FORA DA ÁREA DE FORMALIZAÇÃO DO CLIENTE')),
            unaccent(upper('REVISE ATUAÇÃO CADASTRO TELEFONE P VÁRIOS CPF')),
            unaccent(upper('SOLICITAÇÃO DE EVIDÊNCIAS')),
            unaccent(upper('SEM MAIORES INFORMAÇÕES')),
            unaccent(upper('RETORNADO E AGUARDANDO INFORMAÇÕES'))
          ) THEN 'OPERACIONAL ROTINA'
          WHEN unaccent(upper(f.ds_motivo)) IN (
            unaccent(upper('IRREGULARIDADE EM PROPOSTA DOCUMENTO')),
            unaccent(upper('VOLUME CONTESTAÇÕES LIQUIDAÇÃO ANTECIPADA')),
            unaccent(upper('NÃO PERTURBE')),
            unaccent(upper('ATUAÇÃO INDEVIDA EM PROPOSTA')),
            unaccent(upper('USUARIO HACKEADO')),
            unaccent(upper('SUSPENSO TEMPORARIAMENTE CONTESTAÇÃO')),
            unaccent(upper('PLANO DE QUALIDADE')),
            unaccent(upper('INDICADOR DE QUALIDADE')),
            unaccent(upper('REVISE ATUAÇÃO DIGITAÇÕES EXCESSIVAS PARA O MESMO CPF')),
            unaccent(upper('REVISE ATUAÇÃO MÁ VENDA OFERTA'))
          ) THEN 'RISCO CONTROLADO'
          WHEN unaccent(upper(f.ds_motivo)) IN (
            unaccent(upper('DEVOLUÇÃO TERCEIROS')),
            unaccent(upper('SUSPEITA DE FRAUDE')),
            unaccent(upper('PORTABILIDADE POR FORA'))
          ) THEN 'RISCO CRITICO'
          ELSE NULL
        END
      )) AS chave_norm
    FROM core.tb_fraude f
    WHERE f.dt_evento::date BETWEEN p_dt_inicio AND p_dt_fim
      AND f.ds_motivo IS NOT NULL
  ),
  fraude_cnt_classificacao AS (
    SELECT
      fb.cd_agente,
      fb.chave_norm,
      COUNT(*)::int AS qtd
    FROM fraude_base fb
    WHERE fb.chave_norm IS NOT NULL
    GROUP BY fb.cd_agente, fb.chave_norm
  ),
  fraude_cnt_motivo AS (
    SELECT
      fb.cd_agente,
      fb.chave_norm,
      fb.ds_motivo,
      COUNT(*)::int AS qtd
    FROM fraude_base fb
    WHERE fb.chave_norm IS NOT NULL
    GROUP BY fb.cd_agente, fb.chave_norm, fb.ds_motivo
  ),
  esteira_bool AS (
    SELECT
      ea.cd_agente,
      unaccent(upper(r.ds_regra)) AS chave_norm,
      1::int AS qtd
    FROM esteira_atual ea
    JOIN core.tb_regra r
      ON r.tp_evento = 'ESTEIRA'
     AND r.tp_regra  = 'BOOLEAN'
     AND r.ativo = true
     AND unaccent(upper(ea.ds_esteira)) = unaccent(upper(r.ds_regra))
  ),
  doc_bool AS (
    SELECT
      a.cd_agente,
      unaccent(upper('NAO TEM DOCUMENTACAO ASSINADA')) AS chave_norm,
      1::int AS qtd
    FROM agentes a
    WHERE NOT EXISTS (
      SELECT 1
      FROM core.tb_documento_clicksign d
      WHERE d.cd_agente = a.cd_agente
        AND d.uploaded_at::date BETWEEN p_dt_inicio AND p_dt_fim
        AND unaccent(upper(d.filename)) LIKE '%CPS CONTRATO DE PRESTACAO DE SERVIC% GRUPO LEV%'
        AND d.status = 'closed'
    )
  ),
  aplicacoes_brutas AS (
    SELECT 'POSVENDA'::text AS tp_evento, p.cd_agente, p.chave_norm, p.qtd FROM posvenda_cnt p
    UNION ALL
    SELECT 'NUVIDEO', n.cd_agente, n.chave_norm, n.qtd FROM nuvideo_cnt n
    UNION ALL
    SELECT 'AUTORREGULACAO', a.cd_agente, a.chave_norm, a.qtd FROM autorreg_cnt a
    UNION ALL
    SELECT 'FRAUDE', f.cd_agente, f.chave_norm, f.qtd FROM fraude_cnt_classificacao f
    UNION ALL
    SELECT 'ESTEIRA', e.cd_agente, e.chave_norm, e.qtd FROM esteira_bool e
    UNION ALL
    SELECT 'DOCUMENTACAO', d.cd_agente, d.chave_norm, d.qtd FROM doc_bool d
  ),
  aplicacoes_com_regra AS (
    SELECT
      ab.tp_evento,
      ab.cd_agente,
      r.id_regra,
      r.ds_regra,
      ab.qtd,
      ab.chave_norm
    FROM aplicacoes_brutas ab
    JOIN core.tb_regra r
      ON r.tp_evento = ab.tp_evento
     AND r.ativo = true
     AND unaccent(upper(r.ds_regra)) = ab.chave_norm
  ),
  aplicacoes_com_faixa AS (
    SELECT
      acr.cd_agente,
      acr.id_regra,
      acr.tp_evento,
      acr.ds_regra,
      acr.qtd,
      rf.qtd_ini,
      rf.qtd_fim,
      rf.vl_desconto
    FROM aplicacoes_com_regra acr
    JOIN core.tb_regra_faixa rf
      ON rf.id_regra = acr.id_regra
     AND (acr.qtd::numeric BETWEEN rf.qtd_ini AND rf.qtd_fim)
  ),
  ins_score AS (
    INSERT INTO core.tb_score_monitoramento_agente (
      cd_agente,
      dt_inicio_periodo,
      dt_fim_periodo,
      vl_score_inicial,
      ds_esteira_periodo,
      vl_desc_esteira,
      vl_desc_documentacao,
      vl_desc_nuvideo,
      vl_desc_autorreg,
      vl_desc_posvenda,
      vl_desc_fraude,
      vl_score_final
    )
    SELECT
      a.cd_agente,
      p_dt_inicio,
      p_dt_fim,
      1000,
      ea.ds_esteira,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'ESTEIRA' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'DOCUMENTACAO' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'NUVIDEO' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'AUTORREGULACAO' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'POSVENDA' THEN acf.vl_desconto ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN acf.tp_evento = 'FRAUDE' THEN acf.vl_desconto ELSE 0 END),0)::int,
      (1000 - COALESCE(SUM(acf.vl_desconto),0))::int AS vl_score_final
    FROM agentes a
    LEFT JOIN esteira_atual ea ON ea.cd_agente = a.cd_agente
    LEFT JOIN aplicacoes_com_faixa acf ON acf.cd_agente = a.cd_agente
    GROUP BY a.cd_agente, ea.ds_esteira
    RETURNING id_score, cd_agente
  ),
  ins_detalhe AS (
    INSERT INTO core.tb_score_monitoramento_detalhe (
      id_score,
      id_regra,
      chave_evento,
      qtd_ocorrencias,
      vl_desconto_aplicado,
      observacao
    )
    SELECT
      s.id_score,
      acf.id_regra,
      acf.ds_regra,
      acf.qtd,
      acf.vl_desconto,
      NULL::text
    FROM aplicacoes_com_faixa acf
    JOIN ins_score s ON s.cd_agente = acf.cd_agente
    RETURNING 1
  ),
  ins_fraude_motivo AS (
    INSERT INTO core.tb_score_monitoramento_fraude_motivo (
      id_score,
      id_regra,
      ds_classificacao,
      ds_motivo,
      qtd_ocorrencias
    )
    SELECT
      s.id_score,
      r.id_regra,
      r.ds_regra AS ds_classificacao,
      fm.ds_motivo,
      fm.qtd
    FROM fraude_cnt_motivo fm
    JOIN ins_score s
      ON s.cd_agente = fm.cd_agente
    JOIN core.tb_regra r
      ON r.tp_evento = 'FRAUDE'
     AND r.ativo = true
     AND unaccent(upper(r.ds_regra)) = fm.chave_norm
    RETURNING 1
  )
  SELECT 1 INTO v_dummy;

END;
$procedure$;
    `);

    await queryInterface.sequelize.query(`
CREATE OR REPLACE PROCEDURE core.sp_match_documentos_clicksign()
LANGUAGE plpgsql
AS $procedure$
BEGIN
  TRUNCATE TABLE core.tb_match_pendente;

  WITH unicos AS (
    SELECT cpf_cnpj, MIN(cd_agente) AS cd_agente
    FROM core.tb_agente
    WHERE cpf_cnpj IS NOT NULL
      AND length(cpf_cnpj) = 11
    GROUP BY cpf_cnpj
    HAVING COUNT(*) = 1
  )
  UPDATE core.tb_documento_clicksign d
  SET cd_agente = u.cd_agente
  FROM unicos u
  WHERE d.cd_agente IS NULL
    AND d.uploaded_at::date > DATE '2025-12-31'
    AND d.filename IS NOT NULL
    AND unaccent(regexp_replace(upper(d.filename), '[^A-Z0-9 ]+', ' ', 'g'))
        LIKE '%CPS CONTRATO DE PRESTACAO DE SERVIC% GRUPO LEV%'
    AND d.cpf_extraido IS NOT NULL
    AND u.cpf_cnpj = d.cpf_extraido;

  WITH unicos AS (
    SELECT cpf_cnpj, MIN(cd_agente) AS cd_agente
    FROM core.tb_agente
    WHERE cpf_cnpj IS NOT NULL
      AND length(cpf_cnpj) = 14
    GROUP BY cpf_cnpj
    HAVING COUNT(*) = 1
  )
  UPDATE core.tb_documento_clicksign d
  SET cd_agente = u.cd_agente
  FROM unicos u
  WHERE d.cd_agente IS NULL
    AND d.uploaded_at::date > DATE '2025-12-31'
    AND d.filename IS NOT NULL
    AND unaccent(regexp_replace(upper(d.filename), '[^A-Z0-9 ]+', ' ', 'g'))
        LIKE '%CPS CONTRATO DE PRESTACAO DE SERVIC% GRUPO LEV%'
    AND d.cnpj_extraido IS NOT NULL
    AND u.cpf_cnpj = d.cnpj_extraido;

  INSERT INTO core.tb_match_pendente (origem, chave_origem, cpf_extraido, filename)
  SELECT
    'CLICKSIGN' AS origem,
    d.clicksign_document_key::text AS chave_origem,
    COALESCE(d.cpf_extraido, d.cnpj_extraido) AS cpf_extraido,
    d.filename
  FROM core.tb_documento_clicksign d
  WHERE d.cd_agente IS NULL
    AND d.uploaded_at::date > DATE '2025-12-31'
    AND d.filename IS NOT NULL
    AND unaccent(regexp_replace(upper(d.filename), '[^A-Z0-9 ]+', ' ', 'g'))
        LIKE '%CPS CONTRATO DE PRESTACAO DE SERVIC% GRUPO LEV%'
    AND (d.cpf_extraido IS NOT NULL OR d.cnpj_extraido IS NOT NULL);

END;
$procedure$;
    `);
  },

};