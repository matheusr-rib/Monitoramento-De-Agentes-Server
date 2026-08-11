import { QueryInterface } from "sequelize";

function sql(s: string) {
  return s.replace(/\u00A0/g, " ");
}

export const up = async (queryInterface: QueryInterface) => {
  // Drop primeiro para evitar erro de troca de tipo de coluna em CREATE OR REPLACE VIEW
  await queryInterface.sequelize.query(
    sql(`
DROP VIEW IF EXISTS core.vw_score_detalhe_evento_item;
`)
  );

  await queryInterface.sequelize.query(
    sql(`
DROP VIEW IF EXISTS core.vw_score_detalhe_descontos;
`)
  );

  // Recria core.vw_score_detalhe_descontos exibindo ALERTA no lugar de FRAUDE
  await queryInterface.sequelize.query(
    sql(`
CREATE VIEW core.vw_score_detalhe_descontos AS
 SELECT
    s.id_score,
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    s.cd_agente,
    a.nome,
    CASE
      WHEN r.tp_evento = 'FRAUDE' THEN 'ALERTA'
      ELSE r.tp_evento
    END AS tp_evento,
    r.tp_regra,
    r.id_regra,
    r.ds_regra,
    r.ds_descricao,
    d.qtd_ocorrencias,
    d.vl_desconto_aplicado,
    d.observacao
   FROM core.tb_score_monitoramento_detalhe d
   JOIN core.tb_score_monitoramento_agente s ON (s.id_score = d.id_score)
   JOIN core.tb_agente a ON (a.cd_agente = s.cd_agente)
   JOIN core.tb_regra r ON (r.id_regra = d.id_regra);
`)
  );

  // Recria core.vw_score_detalhe_evento_item exibindo ALERTA no lugar de FRAUDE
  await queryInterface.sequelize.query(
    sql(`
CREATE VIEW core.vw_score_detalhe_evento_item AS
 WITH base_detalhe AS (
         SELECT
            s.id_score,
            s.dt_inicio_periodo,
            s.dt_fim_periodo,
            s.cd_agente,
            a.nome,
            CASE
              WHEN r.tp_evento = 'FRAUDE' THEN 'ALERTA'
              ELSE r.tp_evento
            END AS tp_evento,
            r.id_regra,
            r.ds_regra,
            d.qtd_ocorrencias,
            d.vl_desconto_aplicado
           FROM core.tb_score_monitoramento_detalhe d
           JOIN core.tb_score_monitoramento_agente s ON (s.id_score = d.id_score)
           JOIN core.tb_regra r ON (r.id_regra = d.id_regra)
           JOIN core.tb_agente a ON (a.cd_agente = s.cd_agente)
        ),
      fraude_motivo_rateio AS (
         SELECT
            s.id_score,
            s.dt_inicio_periodo,
            s.dt_fim_periodo,
            s.cd_agente,
            a.nome,
            'ALERTA' AS tp_evento,
            fm.id_regra,
            fm.ds_classificacao,
            fm.ds_motivo AS ds_item_exibido,
            fm.qtd_ocorrencias,
            d.vl_desconto_aplicado AS vl_desconto_classificacao,
            sum(fm.qtd_ocorrencias) OVER (PARTITION BY fm.id_score, fm.id_regra) AS qtd_total_classificacao
           FROM core.tb_score_monitoramento_fraude_motivo fm
           JOIN core.tb_score_monitoramento_agente s ON (s.id_score = fm.id_score)
           JOIN core.tb_agente a ON (a.cd_agente = s.cd_agente)
           JOIN core.tb_score_monitoramento_detalhe d
             ON ((d.id_score = fm.id_score) AND (d.id_regra = fm.id_regra))
      )
 SELECT
    bd.id_score,
    bd.dt_inicio_periodo,
    bd.dt_fim_periodo,
    bd.cd_agente,
    bd.nome,
    bd.tp_evento,
    bd.ds_regra AS ds_item_exibido,
    bd.qtd_ocorrencias,
    bd.vl_desconto_aplicado,
    NULL::text AS ds_classificacao
   FROM base_detalhe bd
  WHERE ((bd.tp_evento)::text <> 'ALERTA'::text)

UNION ALL

 SELECT
    fmr.id_score,
    fmr.dt_inicio_periodo,
    fmr.dt_fim_periodo,
    fmr.cd_agente,
    fmr.nome,
    fmr.tp_evento,
    fmr.ds_item_exibido,
    fmr.qtd_ocorrencias,
    CASE
      WHEN (fmr.qtd_total_classificacao > 0)
        THEN round(
          (((fmr.vl_desconto_classificacao)::numeric * (fmr.qtd_ocorrencias)::numeric) / (fmr.qtd_total_classificacao)::numeric),
          2
        )
      ELSE (0)::numeric
    END AS vl_desconto_aplicado,
    fmr.ds_classificacao
   FROM fraude_motivo_rateio fmr;
`)
  );
};

export const down = async (queryInterface: QueryInterface) => {
  // Drop primeiro para voltar exatamente ao formato anterior
  await queryInterface.sequelize.query(
    sql(`
DROP VIEW IF EXISTS core.vw_score_detalhe_evento_item;
`)
  );

  await queryInterface.sequelize.query(
    sql(`
DROP VIEW IF EXISTS core.vw_score_detalhe_descontos;
`)
  );

  // Recria core.vw_score_detalhe_descontos no formato original
  await queryInterface.sequelize.query(
    sql(`
CREATE VIEW core.vw_score_detalhe_descontos AS
 SELECT
    s.id_score,
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    s.cd_agente,
    a.nome,
    r.tp_evento,
    r.tp_regra,
    r.id_regra,
    r.ds_regra,
    r.ds_descricao,
    d.qtd_ocorrencias,
    d.vl_desconto_aplicado,
    d.observacao
   FROM core.tb_score_monitoramento_detalhe d
   JOIN core.tb_score_monitoramento_agente s ON (s.id_score = d.id_score)
   JOIN core.tb_agente a ON (a.cd_agente = s.cd_agente)
   JOIN core.tb_regra r ON (r.id_regra = d.id_regra);
`)
  );

  // Recria core.vw_score_detalhe_evento_item no formato original
  await queryInterface.sequelize.query(
    sql(`
CREATE VIEW core.vw_score_detalhe_evento_item AS
 WITH base_detalhe AS (
         SELECT
            s.id_score,
            s.dt_inicio_periodo,
            s.dt_fim_periodo,
            s.cd_agente,
            a.nome,
            r.tp_evento,
            r.id_regra,
            r.ds_regra,
            d.qtd_ocorrencias,
            d.vl_desconto_aplicado
           FROM core.tb_score_monitoramento_detalhe d
           JOIN core.tb_score_monitoramento_agente s ON (s.id_score = d.id_score)
           JOIN core.tb_regra r ON (r.id_regra = d.id_regra)
           JOIN core.tb_agente a ON (a.cd_agente = s.cd_agente)
        ),
      fraude_motivo_rateio AS (
         SELECT
            s.id_score,
            s.dt_inicio_periodo,
            s.dt_fim_periodo,
            s.cd_agente,
            a.nome,
            'FRAUDE' AS tp_evento,
            fm.id_regra,
            fm.ds_classificacao,
            fm.ds_motivo AS ds_item_exibido,
            fm.qtd_ocorrencias,
            d.vl_desconto_aplicado AS vl_desconto_classificacao,
            sum(fm.qtd_ocorrencias) OVER (PARTITION BY fm.id_score, fm.id_regra) AS qtd_total_classificacao
           FROM core.tb_score_monitoramento_fraude_motivo fm
           JOIN core.tb_score_monitoramento_agente s ON (s.id_score = fm.id_score)
           JOIN core.tb_agente a ON (a.cd_agente = s.cd_agente)
           JOIN core.tb_score_monitoramento_detalhe d
             ON ((d.id_score = fm.id_score) AND (d.id_regra = fm.id_regra))
      )
 SELECT
    bd.id_score,
    bd.dt_inicio_periodo,
    bd.dt_fim_periodo,
    bd.cd_agente,
    bd.nome,
    bd.tp_evento,
    bd.ds_regra AS ds_item_exibido,
    bd.qtd_ocorrencias,
    bd.vl_desconto_aplicado,
    NULL::text AS ds_classificacao
   FROM base_detalhe bd
  WHERE ((bd.tp_evento)::text <> 'FRAUDE'::text)

UNION ALL

 SELECT
    fmr.id_score,
    fmr.dt_inicio_periodo,
    fmr.dt_fim_periodo,
    fmr.cd_agente,
    fmr.nome,
    fmr.tp_evento,
    fmr.ds_item_exibido,
    fmr.qtd_ocorrencias,
    CASE
      WHEN (fmr.qtd_total_classificacao > 0)
        THEN round(
          (((fmr.vl_desconto_classificacao)::numeric * (fmr.qtd_ocorrencias)::numeric) / (fmr.qtd_total_classificacao)::numeric),
          2
        )
      ELSE (0)::numeric
    END AS vl_desconto_aplicado,
    fmr.ds_classificacao
   FROM fraude_motivo_rateio fmr;
`)
  );
};