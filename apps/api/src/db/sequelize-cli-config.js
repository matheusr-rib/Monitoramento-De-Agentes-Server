module.exports = {
  development: {
    dialect: 'postgres',
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'score_db',
    username: process.env.PGUSER || 'score_user',
    password: process.env.PGPASSWORD || 'score_pass',
    logging: false,
  },
  production: {
    dialect: 'postgres',
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    logging: false,
  },
};