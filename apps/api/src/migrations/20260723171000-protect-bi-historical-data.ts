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

export const up = async (queryInterface: QueryInterface) => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await query(
      queryInterface,
      `
CREATE OR REPLACE FUNCTION core.fn_bloquear_truncate_historico_bi()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Tabela historica do Power BI: TRUNCATE nao e permitido';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_bloquear_truncate_bi_resumo
ON core.tb_bi_score_resumo_historico;
CREATE TRIGGER tr_bloquear_truncate_bi_resumo
BEFORE TRUNCATE
ON core.tb_bi_score_resumo_historico
FOR EACH STATEMENT
EXECUTE FUNCTION core.fn_bloquear_truncate_historico_bi();

DROP TRIGGER IF EXISTS tr_bloquear_truncate_bi_detalhe
ON core.tb_bi_score_detalhe_descontos_historico;
CREATE TRIGGER tr_bloquear_truncate_bi_detalhe
BEFORE TRUNCATE
ON core.tb_bi_score_detalhe_descontos_historico
FOR EACH STATEMENT
EXECUTE FUNCTION core.fn_bloquear_truncate_historico_bi();

DROP TRIGGER IF EXISTS tr_bloquear_truncate_bi_fraude
ON core.tb_bi_score_fraude_motivos_historico;
CREATE TRIGGER tr_bloquear_truncate_bi_fraude
BEFORE TRUNCATE
ON core.tb_bi_score_fraude_motivos_historico
FOR EACH STATEMENT
EXECUTE FUNCTION core.fn_bloquear_truncate_historico_bi();

DROP TRIGGER IF EXISTS tr_bloquear_truncate_bi_evento_item
ON core.tb_bi_score_detalhe_evento_item_historico;
CREATE TRIGGER tr_bloquear_truncate_bi_evento_item
BEFORE TRUNCATE
ON core.tb_bi_score_detalhe_evento_item_historico
FOR EACH STATEMENT
EXECUTE FUNCTION core.fn_bloquear_truncate_historico_bi();
`,
      transaction
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const down = async (queryInterface: QueryInterface) => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await query(
      queryInterface,
      `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM core.tb_bi_score_resumo_historico LIMIT 1)
     OR EXISTS (SELECT 1 FROM core.tb_bi_score_detalhe_descontos_historico LIMIT 1)
     OR EXISTS (SELECT 1 FROM core.tb_bi_score_fraude_motivos_historico LIMIT 1)
     OR EXISTS (SELECT 1 FROM core.tb_bi_score_detalhe_evento_item_historico LIMIT 1) THEN
    RAISE EXCEPTION
      'Rollback bloqueado: as tabelas historicas do Power BI possuem dados';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tr_bloquear_truncate_bi_evento_item
ON core.tb_bi_score_detalhe_evento_item_historico;
DROP TRIGGER IF EXISTS tr_bloquear_truncate_bi_fraude
ON core.tb_bi_score_fraude_motivos_historico;
DROP TRIGGER IF EXISTS tr_bloquear_truncate_bi_detalhe
ON core.tb_bi_score_detalhe_descontos_historico;
DROP TRIGGER IF EXISTS tr_bloquear_truncate_bi_resumo
ON core.tb_bi_score_resumo_historico;
DROP FUNCTION IF EXISTS core.fn_bloquear_truncate_historico_bi();
`,
      transaction
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
