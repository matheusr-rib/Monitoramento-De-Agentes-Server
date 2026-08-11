import { QueryInterface, Transaction } from "sequelize";

function sql(value: string) {
  return value.replace(/\u00A0/g, " ");
}

async function query(
  queryInterface: QueryInterface,
  statement: string,
  transaction: Transaction
) {
  await queryInterface.sequelize.query(sql(statement), { transaction });
}

const dropPowerBiViewsSql = `
DROP VIEW IF EXISTS core.vw_score_detalhe_evento_item;
DROP VIEW IF EXISTS core.vw_score_fraude_motivos;
DROP VIEW IF EXISTS core.vw_score_detalhe_descontos;
DROP VIEW IF EXISTS core.vw_dim_periodo_score;
DROP VIEW IF EXISTS core.vw_score_resumo_periodo;
`;

const createConsolidatedViewsSql = `
CREATE VIEW core.vw_score_resumo_periodo AS
SELECT
    h.id_score,
    h.dt_inicio_periodo,
    h.dt_fim_periodo,
    h.cd_agente,
    h.nome,
    h.cpf_cnpj,
    h.ds_status,
    h.ds_esteira_periodo,
    h.vl_score_inicial,
    h.vl_desc_esteira,
    h.vl_desc_documentacao,
    h.vl_desc_nuvideo,
    h.vl_desc_autorreg,
    h.vl_desc_posvenda,
    h.vl_desc_fraude,
    h.vl_desconto_total,
    h.vl_score_final,
    h.dt_calculo
FROM core.tb_bi_score_resumo_historico h
WHERE h.dt_fim_periodo <= DATE '2026-06-30'

UNION ALL

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
JOIN core.tb_agente a ON a.cd_agente = s.cd_agente
WHERE s.dt_inicio_periodo >= DATE '2026-07-01';

CREATE VIEW core.vw_dim_periodo_score AS
SELECT DISTINCT
    r.dt_inicio_periodo,
    r.dt_fim_periodo,
    to_char(r.dt_inicio_periodo::timestamp with time zone, 'YYYY-MM-DD')
      || ' a '
      || to_char(r.dt_fim_periodo::timestamp with time zone, 'YYYY-MM-DD') AS ds_periodo
FROM core.vw_score_resumo_periodo r;

CREATE VIEW core.vw_score_detalhe_descontos AS
SELECT
    h.id_score,
    h.dt_inicio_periodo,
    h.dt_fim_periodo,
    h.cd_agente,
    h.nome,
    h.tp_evento,
    h.tp_regra,
    h.id_regra,
    h.ds_regra,
    h.ds_descricao,
    h.qtd_ocorrencias,
    h.vl_desconto_aplicado,
    h.observacao
FROM core.tb_bi_score_detalhe_descontos_historico h
WHERE h.dt_fim_periodo <= DATE '2026-06-30'

UNION ALL

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
JOIN core.tb_score_monitoramento_agente s ON s.id_score = d.id_score
JOIN core.tb_agente a ON a.cd_agente = s.cd_agente
JOIN core.tb_regra r ON r.id_regra = d.id_regra
WHERE s.dt_inicio_periodo >= DATE '2026-07-01';

CREATE VIEW core.vw_score_fraude_motivos AS
SELECT
    h.id_score,
    h.dt_inicio_periodo,
    h.dt_fim_periodo,
    h.cd_agente,
    h.nome,
    h.id_regra,
    h.ds_classificacao,
    h.ds_motivo,
    h.qtd_ocorrencias
FROM core.tb_bi_score_fraude_motivos_historico h
WHERE h.dt_fim_periodo <= DATE '2026-06-30'

UNION ALL

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
JOIN core.tb_score_monitoramento_agente s ON s.id_score = fm.id_score
JOIN core.tb_agente a ON a.cd_agente = s.cd_agente
WHERE s.dt_inicio_periodo >= DATE '2026-07-01';

CREATE VIEW core.vw_score_detalhe_evento_item AS
WITH live_base_detalhe AS (
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
        r.ds_regra,
        d.qtd_ocorrencias,
        d.vl_desconto_aplicado
    FROM core.tb_score_monitoramento_detalhe d
    JOIN core.tb_score_monitoramento_agente s ON s.id_score = d.id_score
    JOIN core.tb_regra r ON r.id_regra = d.id_regra
    JOIN core.tb_agente a ON a.cd_agente = s.cd_agente
    WHERE s.dt_inicio_periodo >= DATE '2026-07-01'
),
live_fraude_motivo_rateio AS (
    SELECT
        s.id_score,
        s.dt_inicio_periodo,
        s.dt_fim_periodo,
        s.cd_agente,
        a.nome,
        'ALERTA'::text AS tp_evento,
        fm.id_regra,
        fm.ds_classificacao,
        fm.ds_motivo AS ds_item_exibido,
        fm.qtd_ocorrencias,
        d.vl_desconto_aplicado AS vl_desconto_classificacao,
        sum(fm.qtd_ocorrencias) OVER (
          PARTITION BY fm.id_score, fm.id_regra
        ) AS qtd_total_classificacao
    FROM core.tb_score_monitoramento_fraude_motivo fm
    JOIN core.tb_score_monitoramento_agente s ON s.id_score = fm.id_score
    JOIN core.tb_agente a ON a.cd_agente = s.cd_agente
    JOIN core.tb_score_monitoramento_detalhe d
      ON d.id_score = fm.id_score
     AND d.id_regra = fm.id_regra
    WHERE s.dt_inicio_periodo >= DATE '2026-07-01'
),
live_eventos AS (
    SELECT
        bd.id_score,
        bd.dt_inicio_periodo,
        bd.dt_fim_periodo,
        bd.cd_agente,
        bd.nome,
        bd.tp_evento,
        bd.ds_regra AS ds_item_exibido,
        bd.qtd_ocorrencias,
        bd.vl_desconto_aplicado::numeric AS vl_desconto_aplicado,
        NULL::text AS ds_classificacao
    FROM live_base_detalhe bd
    WHERE bd.tp_evento <> 'ALERTA'

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
          WHEN fmr.qtd_total_classificacao > 0
            THEN round(
              fmr.vl_desconto_classificacao::numeric
              * fmr.qtd_ocorrencias::numeric
              / fmr.qtd_total_classificacao::numeric,
              2
            )
          ELSE 0::numeric
        END AS vl_desconto_aplicado,
        fmr.ds_classificacao
    FROM live_fraude_motivo_rateio fmr
)
SELECT
    h.id_score,
    h.dt_inicio_periodo,
    h.dt_fim_periodo,
    h.cd_agente,
    h.nome,
    h.tp_evento,
    h.ds_item_exibido,
    h.qtd_ocorrencias,
    h.vl_desconto_aplicado,
    h.ds_classificacao
FROM core.tb_bi_score_detalhe_evento_item_historico h
WHERE h.dt_fim_periodo <= DATE '2026-06-30'

UNION ALL

SELECT
    e.id_score,
    e.dt_inicio_periodo,
    e.dt_fim_periodo,
    e.cd_agente,
    e.nome,
    e.tp_evento,
    e.ds_item_exibido,
    e.qtd_ocorrencias,
    e.vl_desconto_aplicado,
    e.ds_classificacao
FROM live_eventos e;
`;

const createLiveOnlyViewsSql = `
CREATE VIEW core.vw_score_resumo_periodo AS
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
JOIN core.tb_agente a ON a.cd_agente = s.cd_agente;

CREATE VIEW core.vw_dim_periodo_score AS
SELECT DISTINCT
    s.dt_inicio_periodo,
    s.dt_fim_periodo,
    to_char(s.dt_inicio_periodo::timestamp with time zone, 'YYYY-MM-DD')
      || ' a '
      || to_char(s.dt_fim_periodo::timestamp with time zone, 'YYYY-MM-DD') AS ds_periodo
FROM core.tb_score_monitoramento_agente s;

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
JOIN core.tb_score_monitoramento_agente s ON s.id_score = d.id_score
JOIN core.tb_agente a ON a.cd_agente = s.cd_agente
JOIN core.tb_regra r ON r.id_regra = d.id_regra;

CREATE VIEW core.vw_score_fraude_motivos AS
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
JOIN core.tb_score_monitoramento_agente s ON s.id_score = fm.id_score
JOIN core.tb_agente a ON a.cd_agente = s.cd_agente;

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
    JOIN core.tb_score_monitoramento_agente s ON s.id_score = d.id_score
    JOIN core.tb_regra r ON r.id_regra = d.id_regra
    JOIN core.tb_agente a ON a.cd_agente = s.cd_agente
),
fraude_motivo_rateio AS (
    SELECT
        s.id_score,
        s.dt_inicio_periodo,
        s.dt_fim_periodo,
        s.cd_agente,
        a.nome,
        'ALERTA'::text AS tp_evento,
        fm.id_regra,
        fm.ds_classificacao,
        fm.ds_motivo AS ds_item_exibido,
        fm.qtd_ocorrencias,
        d.vl_desconto_aplicado AS vl_desconto_classificacao,
        sum(fm.qtd_ocorrencias) OVER (
          PARTITION BY fm.id_score, fm.id_regra
        ) AS qtd_total_classificacao
    FROM core.tb_score_monitoramento_fraude_motivo fm
    JOIN core.tb_score_monitoramento_agente s ON s.id_score = fm.id_score
    JOIN core.tb_agente a ON a.cd_agente = s.cd_agente
    JOIN core.tb_score_monitoramento_detalhe d
      ON d.id_score = fm.id_score
     AND d.id_regra = fm.id_regra
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
    bd.vl_desconto_aplicado::numeric AS vl_desconto_aplicado,
    NULL::text AS ds_classificacao
FROM base_detalhe bd
WHERE bd.tp_evento <> 'ALERTA'

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
      WHEN fmr.qtd_total_classificacao > 0
        THEN round(
          fmr.vl_desconto_classificacao::numeric
          * fmr.qtd_ocorrencias::numeric
          / fmr.qtd_total_classificacao::numeric,
          2
        )
      ELSE 0::numeric
    END AS vl_desconto_aplicado,
    fmr.ds_classificacao
FROM fraude_motivo_rateio fmr;
`;

export const up = async (queryInterface: QueryInterface) => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await query(queryInterface, dropPowerBiViewsSql, transaction);

    await query(
      queryInterface,
      `
CREATE TABLE core.tb_bi_score_resumo_historico (
    id_score bigint PRIMARY KEY,
    dt_inicio_periodo date NOT NULL,
    dt_fim_periodo date NOT NULL,
    cd_agente bigint NOT NULL,
    nome text NOT NULL,
    cpf_cnpj text NULL,
    ds_status text NOT NULL,
    ds_esteira_periodo text NULL,
    vl_score_inicial integer NOT NULL,
    vl_desc_esteira integer NOT NULL,
    vl_desc_documentacao integer NOT NULL,
    vl_desc_nuvideo integer NOT NULL,
    vl_desc_autorreg integer NOT NULL,
    vl_desc_posvenda integer NOT NULL,
    vl_desc_fraude integer NOT NULL,
    vl_desconto_total integer NOT NULL,
    vl_score_final integer NOT NULL,
    dt_calculo timestamp with time zone NOT NULL,
    CONSTRAINT ck_bi_resumo_historico_id_negativo
      CHECK (id_score < 0),
    CONSTRAINT ck_bi_resumo_historico_periodo
      CHECK (
        dt_inicio_periodo >= DATE '2026-01-01'
        AND dt_fim_periodo <= DATE '2026-06-30'
        AND dt_inicio_periodo <= dt_fim_periodo
      ),
    CONSTRAINT ck_bi_resumo_historico_score
      CHECK (vl_score_inicial - vl_score_final = vl_desconto_total),
    CONSTRAINT ck_bi_resumo_historico_componentes
      CHECK (
        vl_desc_esteira
        + vl_desc_documentacao
        + vl_desc_nuvideo
        + vl_desc_autorreg
        + vl_desc_posvenda
        + vl_desc_fraude
        = vl_desconto_total
      ),
    CONSTRAINT uq_bi_resumo_historico_agente_periodo
      UNIQUE (cd_agente, dt_inicio_periodo, dt_fim_periodo)
);

CREATE TABLE core.tb_bi_score_detalhe_descontos_historico (
    id_historico bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_score bigint NOT NULL,
    dt_inicio_periodo date NOT NULL,
    dt_fim_periodo date NOT NULL,
    cd_agente bigint NOT NULL,
    nome text NOT NULL,
    tp_evento text NOT NULL,
    tp_regra text NOT NULL,
    id_regra bigint NOT NULL,
    ds_regra text NOT NULL,
    ds_descricao text NOT NULL,
    qtd_ocorrencias integer NOT NULL,
    vl_desconto_aplicado integer NOT NULL,
    observacao text NULL,
    CONSTRAINT fk_bi_detalhe_historico_score
      FOREIGN KEY (id_score)
      REFERENCES core.tb_bi_score_resumo_historico (id_score)
      ON DELETE CASCADE,
    CONSTRAINT ck_bi_detalhe_historico_periodo
      CHECK (
        dt_inicio_periodo >= DATE '2026-01-01'
        AND dt_fim_periodo <= DATE '2026-06-30'
        AND dt_inicio_periodo <= dt_fim_periodo
      ),
    CONSTRAINT uq_bi_detalhe_historico_score_regra
      UNIQUE (id_score, id_regra)
);

CREATE TABLE core.tb_bi_score_fraude_motivos_historico (
    id_score bigint NOT NULL,
    dt_inicio_periodo date NOT NULL,
    dt_fim_periodo date NOT NULL,
    cd_agente bigint NOT NULL,
    nome text NOT NULL,
    id_regra bigint NOT NULL,
    ds_classificacao text NOT NULL,
    ds_motivo text NOT NULL,
    qtd_ocorrencias integer NOT NULL,
    CONSTRAINT pk_bi_fraude_motivos_historico
      PRIMARY KEY (id_score, id_regra, ds_motivo),
    CONSTRAINT fk_bi_fraude_motivos_historico_score
      FOREIGN KEY (id_score)
      REFERENCES core.tb_bi_score_resumo_historico (id_score)
      ON DELETE CASCADE,
    CONSTRAINT ck_bi_fraude_motivos_historico_periodo
      CHECK (
        dt_inicio_periodo >= DATE '2026-01-01'
        AND dt_fim_periodo <= DATE '2026-06-30'
        AND dt_inicio_periodo <= dt_fim_periodo
      )
);

CREATE TABLE core.tb_bi_score_detalhe_evento_item_historico (
    id_historico bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_score bigint NOT NULL,
    dt_inicio_periodo date NOT NULL,
    dt_fim_periodo date NOT NULL,
    cd_agente bigint NOT NULL,
    nome text NOT NULL,
    tp_evento text NOT NULL,
    ds_item_exibido text NOT NULL,
    qtd_ocorrencias integer NOT NULL,
    vl_desconto_aplicado numeric NOT NULL,
    ds_classificacao text NULL,
    CONSTRAINT fk_bi_evento_item_historico_score
      FOREIGN KEY (id_score)
      REFERENCES core.tb_bi_score_resumo_historico (id_score)
      ON DELETE CASCADE,
    CONSTRAINT ck_bi_evento_item_historico_periodo
      CHECK (
        dt_inicio_periodo >= DATE '2026-01-01'
        AND dt_fim_periodo <= DATE '2026-06-30'
        AND dt_inicio_periodo <= dt_fim_periodo
      ),
    CONSTRAINT uq_bi_evento_item_historico
      UNIQUE NULLS NOT DISTINCT (
        id_score,
        tp_evento,
        ds_item_exibido,
        ds_classificacao
      )
);

CREATE INDEX ix_bi_resumo_historico_periodo
  ON core.tb_bi_score_resumo_historico (
    dt_inicio_periodo,
    dt_fim_periodo
  );

CREATE INDEX ix_bi_resumo_historico_agente
  ON core.tb_bi_score_resumo_historico (cd_agente);

CREATE INDEX ix_bi_detalhe_historico_score
  ON core.tb_bi_score_detalhe_descontos_historico (id_score);

CREATE INDEX ix_bi_detalhe_historico_periodo
  ON core.tb_bi_score_detalhe_descontos_historico (
    dt_inicio_periodo,
    dt_fim_periodo
  );

CREATE INDEX ix_bi_fraude_historico_periodo
  ON core.tb_bi_score_fraude_motivos_historico (
    dt_inicio_periodo,
    dt_fim_periodo
  );

CREATE INDEX ix_bi_evento_item_historico_score
  ON core.tb_bi_score_detalhe_evento_item_historico (id_score);

CREATE INDEX ix_bi_evento_item_historico_periodo
  ON core.tb_bi_score_detalhe_evento_item_historico (
    dt_inicio_periodo,
    dt_fim_periodo
  );

CREATE OR REPLACE FUNCTION core.fn_bloquear_update_delete_historico_bi()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Tabela historica do Power BI: UPDATE e DELETE nao sao permitidos';
  RETURN OLD;
END;
$$;

CREATE TRIGGER tr_bloquear_update_delete_bi_resumo
BEFORE UPDATE OR DELETE
ON core.tb_bi_score_resumo_historico
FOR EACH ROW
EXECUTE FUNCTION core.fn_bloquear_update_delete_historico_bi();

CREATE TRIGGER tr_bloquear_update_delete_bi_detalhe
BEFORE UPDATE OR DELETE
ON core.tb_bi_score_detalhe_descontos_historico
FOR EACH ROW
EXECUTE FUNCTION core.fn_bloquear_update_delete_historico_bi();

CREATE TRIGGER tr_bloquear_update_delete_bi_fraude
BEFORE UPDATE OR DELETE
ON core.tb_bi_score_fraude_motivos_historico
FOR EACH ROW
EXECUTE FUNCTION core.fn_bloquear_update_delete_historico_bi();

CREATE TRIGGER tr_bloquear_update_delete_bi_evento_item
BEFORE UPDATE OR DELETE
ON core.tb_bi_score_detalhe_evento_item_historico
FOR EACH ROW
EXECUTE FUNCTION core.fn_bloquear_update_delete_historico_bi();
`,
      transaction
    );

    await query(queryInterface, createConsolidatedViewsSql, transaction);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const down = async (queryInterface: QueryInterface) => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await query(queryInterface, dropPowerBiViewsSql, transaction);

    await query(
      queryInterface,
      `
DROP TABLE IF EXISTS core.tb_bi_score_detalhe_evento_item_historico;
DROP TABLE IF EXISTS core.tb_bi_score_fraude_motivos_historico;
DROP TABLE IF EXISTS core.tb_bi_score_detalhe_descontos_historico;
DROP TABLE IF EXISTS core.tb_bi_score_resumo_historico;
DROP FUNCTION IF EXISTS core.fn_bloquear_update_delete_historico_bi();
`,
      transaction
    );

    await query(queryInterface, createLiveOnlyViewsSql, transaction);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
