import { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface) => {
  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_job_run
    DROP CONSTRAINT IF EXISTS ck_job_run_status;
    ALTER TABLE core.tb_job_run
    ADD CONSTRAINT ck_job_run_status
    CHECK (status IN ('QUEUED','RUNNING','SUCCESS','FAILED'));
  `);
};

export const down = async (queryInterface: QueryInterface) => {
  await queryInterface.sequelize.query(`
    ALTER TABLE core.tb_job_run
    DROP CONSTRAINT IF EXISTS ck_job_run_status;
    ALTER TABLE core.tb_job_run
    ADD CONSTRAINT ck_job_run_status
    CHECK (status IN ('RUNNING','SUCCESS','FAILED'));
  `);
};
