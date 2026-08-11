import { QueryInterface, BIGINT, STRING, literal } from 'sequelize';

const CORE = { schema: 'core' as const };

export const up = async (queryInterface: QueryInterface) => {
  // 1) Adiciona colunas NOT NULL com default (para não quebrar tabela existente)
  await queryInterface.addColumn(
    { ...CORE, tableName: 'tb_autorregulacao' },
    'prazo_key',
    {
      type: BIGINT,
      allowNull: false,
      defaultValue: -1,
    }
  );

  await queryInterface.addColumn(
    { ...CORE, tableName: 'tb_autorregulacao' },
    'nr_proposta_key',
    {
      type: STRING(30),
      allowNull: false,
      defaultValue: '__SEM_PROPOSTA__',
    }
  );

  // 2) Backfill dos registros existentes
  // prazo_key = COALESCE(prazo, -1)
  // nr_proposta_key = COALESCE(nr_proposta, '__SEM_PROPOSTA__')
  await queryInterface.sequelize.query(`
    UPDATE core.tb_autorregulacao
    SET
      prazo_key = COALESCE(prazo, (-1)::bigint),
      nr_proposta_key = COALESCE(nr_proposta, '__SEM_PROPOSTA__'::character varying)
    WHERE
      prazo_key IS NULL
      OR nr_proposta_key IS NULL
      OR prazo_key <> COALESCE(prazo, (-1)::bigint)
      OR nr_proposta_key <> COALESCE(nr_proposta, '__SEM_PROPOSTA__'::character varying);
  `);

  // 3) Remove índice antigo por expressão
  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS core.uq_autorreg_evento;
  `);

  // 4) Cria índice UNIQUE simples
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uq_autorreg_evento
    ON core.tb_autorregulacao
    USING btree (
      cd_agente,
      dt_evento,
      convenio,
      prazo_key,
      nr_proposta_key
    );
  `);

  // 5) (Opcional, mas recomendado) índice pragmático para consultas por agente/período
  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS ix_autorreg_agente_data
    ON core.tb_autorregulacao (cd_agente, dt_evento);
  `);
};

export const down = async (queryInterface: QueryInterface) => {
  // volta o índice antigo por expressão
  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS core.uq_autorreg_evento;
  `);

  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX uq_autorreg_evento
    ON core.tb_autorregulacao
    USING btree (
      cd_agente,
      dt_evento,
      convenio,
      COALESCE(prazo, ('-1'::integer)::bigint),
      COALESCE(nr_proposta, '__SEM_PROPOSTA__'::character varying)
    );
  `);

  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS core.ix_autorreg_agente_data;
  `);

  await queryInterface.removeColumn({ schema: 'core', tableName: 'tb_autorregulacao' }, 'prazo_key');
  await queryInterface.removeColumn({ schema: 'core', tableName: 'tb_autorregulacao' }, 'nr_proposta_key');
};