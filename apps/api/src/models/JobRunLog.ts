import { DataTypes, Model, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '@/db/sequelize';

export type JobRunLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'OK';

export class JobRunLog extends Model<
  InferAttributes<JobRunLog>,
  InferCreationAttributes<JobRunLog>
> {
  declare id_job_run_log: number;
  declare id_job_run: number;
  declare level: JobRunLogLevel;
  declare message: string;
  declare meta: object | null;
  declare created_at: Date;
}

JobRunLog.init(
  {
    id_job_run_log: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
    id_job_run: { type: DataTypes.BIGINT, allowNull: false },
    level: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'INFO' },
    message: { type: DataTypes.TEXT, allowNull: false },
    meta: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('now()') },
  },
  {
    sequelize,
    schema: 'core',
    tableName: 'tb_job_run_log',
    timestamps: false,
  }
);
