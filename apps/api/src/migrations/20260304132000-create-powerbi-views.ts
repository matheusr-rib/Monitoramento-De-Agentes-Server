import { QueryInterface } from "sequelize";

function sql(s: string) {
  // remove NBSP que vem do MD / copy-paste
  return s.replace(/\u00A0/g, " ");
}

export const up = async (queryInterface: QueryInterface) => {
  // 1) core.vw_dim_periodo_score
  await queryInterface.sequelize.query(
    sql(`
CREATE OR REPLACE VIEW core.vw_dim_periodo_score AS
 SELECT DISTINCT
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    ((to_char((s.dt_inicio_periodo)::timestamp with time zone, 'YYYY-MM-DD'::text) || ' a '::text) ||
      to_char((s.dt_fim_periodo)::timestamp with time zone, 'YYYY-MM-DD'::text)) AS ds_periodo
   FROM core.tb_score_monitoramento_agente s;
`)
  );

  // 2) core.vw_score_resumo_periodo
  await queryInterface.sequelize.query(
    sql(`
CREATE OR REPLACE VIEW core.vw_score_resumo_periodo AS
 SELECT
    s.id_score,
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    s.cd_agente,
    a.nome,
    a.cpf_cnpj,
    a.ds_status,
    s.ds_esteira_periodo,
    s.vl_score_inicial,
    s.vl_desc_esteira,
    s.vl_desc_documentacao,
    s.vl_desc_nuvideo,
    s.vl_desc_autorreg,
    s.vl_desc_posvenda,
    s.vl_desc_fraude,
    (s.vl_score_inicial - s.vl_score_final) AS vl_desconto_total,
    s.vl_score_final,
    s.dt_calculo
   FROM core.tb_score_monitoramento_agente s
   JOIN core.tb_agente a ON (a.cd_agente = s.cd_agente);
`)
  );

  // 3) core.vw_score_detalhe_descontos
  await queryInterface.sequelize.query(
    sql(`
CREATE OR REPLACE VIEW core.vw_score_detalhe_descontos AS
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

  // 4) core.vw_score_fraude_motivos
  await queryInterface.sequelize.query(
    sql(`
CREATE OR REPLACE VIEW core.vw_score_fraude_motivos AS
 SELECT
    s.id_score,
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    s.cd_agente,
    a.nome,
    fm.id_regra,
    fm.ds_classificacao,
    fm.ds_motivo,
    fm.qtd_ocorrencias
   FROM core.tb_score_monitoramento_fraude_motivo fm
   JOIN core.tb_score_monitoramento_agente s ON (s.id_score = fm.id_score)
   JOIN core.tb_agente a ON (a.cd_agente = s.cd_agente);
`)
  );

  // 5) core.vw_score_detalhe_evento_item
  //     Ajustada para ficar equivalente ao DDL antigo:
  //     - inclui ds_item_exibido (para não-fraude = ds_regra; para fraude = ds_motivo)
  //     - inclui ds_classificacao
  //     - aplica rateio/arredondamento do desconto na fraude (round(...,2))
  await queryInterface.sequelize.query(
    sql(`
CREATE OR REPLACE VIEW core.vw_score_detalhe_evento_item AS
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
            'FRAUDE'::text AS tp_evento,
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

export const down = async (queryInterface: QueryInterface) => {
  // drop na ordem inversa (boa prática)
  await queryInterface.sequelize.query(`DROP VIEW IF EXISTS core.vw_score_detalhe_evento_item;`);
  await queryInterface.sequelize.query(`DROP VIEW IF EXISTS core.vw_score_fraude_motivos;`);
  await queryInterface.sequelize.query(`DROP VIEW IF EXISTS core.vw_score_detalhe_descontos;`);
  await queryInterface.sequelize.query(`DROP VIEW IF EXISTS core.vw_score_resumo_periodo;`);
  await queryInterface.sequelize.query(`DROP VIEW IF EXISTS core.vw_dim_periodo_score;`);
};