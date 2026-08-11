import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const {
  PGHOST = 'localhost',
  PGPORT = '5432',
  PGDATABASE = 'score_db',
  PGUSER = 'score_user',
  PGPASSWORD = 'score_pass',
  PGSSL = 'false',
} = process.env;

export const sequelize = new Sequelize(PGDATABASE, PGUSER, PGPASSWORD, {
  host: PGHOST,
  port: Number(PGPORT),
  dialect: 'postgres',
  logging: false,
  dialectOptions:
    PGSSL === 'true'
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : undefined,
});