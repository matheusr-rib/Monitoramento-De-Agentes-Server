import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '@/db/sequelize';

export type JobRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export class JobRun extends Model<InferAttributes<JobRun>, InferCreationAttributes<JobRun>> {
  declare id_job_run: number;
  declare job_type: string;
  declare status: JobRunStatus;
  declare started_at: Date;
  declare finished_at: Date | null;
  declare requested_by: string;
  declare input_filename: string | null;
  declare input_meta: object | null;
  declare stats: object | null;
  declare error: string | null;
}

JobRun.init(
  {
    id_job_run: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
    job_type: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'RUNNING' },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('now()') },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    requested_by: { type: DataTypes.STRING(255), allowNull: false },
    input_filename: { type: DataTypes.STRING(255), allowNull: true },
    input_meta: { type: DataTypes.JSONB, allowNull: true },
    stats: { type: DataTypes.JSONB, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    schema: 'core',
    tableName: 'tb_job_run',
    timestamps: false,
  }
);