import {
  BIGINT,
  DATE,
  JSONB,
  QueryInterface,
  STRING,
  TEXT,
  literal,
} from 'sequelize';

const CORE = { schema: 'core' as const };

export const up = async (queryInterface: QueryInterface) => {
  // 1) Extensão necessária p/ EXCLUDE com bigint + gist
  await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS btree_gist;`);

  // 2) Tabela de auditoria de execuções (job runs)
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_job_run' },
    {
      id_job_run: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      job_type: {
        type: STRING(40),
        allowNull: false,
      },
      status: {
        type: STRING(10),
        allowNull: false,
        defaultValue: 'RUNNING',
      },
      started_at: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
      finished_at: {
        type: DATE,
        allowNull: true,
      },
      requested_by: {
        type: STRING(255),
        allowNull: false,
      },
      input_filename: {
        type: STRING(255),
        allowNull: true,
      },
      input_meta: {
        type: JSONB,
        allowNull: true,
      },
      stats: {
        type: JSONB,
        allowNull: true,
      },
      error: {
        type: TEXT,
        allowNull: true,
      },
    }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_job_run' },
    ['job_type', 'started_at'],
    { name: 'ix_job_run_type_started' }
  );

  // CHECKs simples (evita lixo no banco)
  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_job_run
    DROP CONSTRAINT IF EXISTS ck_job_run_status;
    ALTER TABLE core.tb_job_run
    ADD CONSTRAINT ck_job_run_status
    CHECK (status IN ('RUNNING','SUCCESS','FAILED'));
  `);

  // (opcional) restringe job_type aos tipos que você citou
  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_job_run
    DROP CONSTRAINT IF EXISTS ck_job_run_type;
    ALTER TABLE core.tb_job_run
    ADD CONSTRAINT ck_job_run_type
    CHECK (
      job_type LIKE 'LOADER_%'
      OR job_type IN ('BACKFILL','PROC_MATCH','PROC_SCORE')
    );
  `);

  // 3) (Opcional, mas útil) Logs por etapa
  await queryInterface.createTable(
    { ...CORE, tableName: 'tb_job_run_log' },
    {
      id_job_run_log: {
        type: BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_job_run: {
        type: BIGINT,
        allowNull: false,
        references: { model: { ...CORE, tableName: 'tb_job_run' }, key: 'id_job_run' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      level: {
        type: STRING(10),
        allowNull: false,
        defaultValue: 'INFO',
      },
      message: {
        type: TEXT,
        allowNull: false,
      },
      meta: {
        type: JSONB,
        allowNull: true,
      },
      created_at: {
        type: DATE,
        allowNull: false,
        defaultValue: literal('now()'),
      },
    }
  );

  await queryInterface.addIndex(
    { ...CORE, tableName: 'tb_job_run_log' },
    ['id_job_run', 'created_at'],
    { name: 'ix_job_run_log_run_created' }
  );

  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_job_run_log
    DROP CONSTRAINT IF EXISTS ck_job_run_log_level;
    ALTER TABLE core.tb_job_run_log
    ADD CONSTRAINT ck_job_run_log_level
    CHECK (level IN ('INFO','WARN','ERROR','OK'));
  `);

  // 4) Normalização imediata do bug: 5+ => 6+ (se já existir dado)
  // Isso evita duplicidade no cálculo (BETWEEN é inclusivo).
  await queryInterface.sequelize.query(`
    UPDATE core.tb_regra_faixa
       SET qtd_ini = 6,
           qtd_fim = GREATEST(qtd_fim, 6)
     WHERE qtd_ini = 5
       AND qtd_fim >= 5;
  `);

  // 5) Constraint anti-sobreposição por regra:
  // impede ranges que "encostam" com overlap (inclusive), tipo 3-5 e 5-1000.
  // Exige qtd_ini/qtd_fim não nulos (as suas faixas usam ambos).
  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_regra_faixa
    DROP CONSTRAINT IF EXISTS ex_regra_faixa_no_overlap;
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_regra_faixa
    ADD CONSTRAINT ex_regra_faixa_no_overlap
    EXCLUDE USING gist (
      id_regra WITH =,
      numrange(qtd_ini, qtd_fim, '[]') WITH &&
    )
    WHERE (qtd_ini IS NOT NULL AND qtd_fim IS NOT NULL);
  `);
};

export const down = async (queryInterface: QueryInterface) => {
  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_regra_faixa
    DROP CONSTRAINT IF EXISTS ex_regra_faixa_no_overlap;
  `);

  await queryInterface.dropTable({ schema: 'core', tableName: 'tb_job_run_log' });
  await queryInterface.dropTable({ schema: 'core', tableName: 'tb_job_run' });
};