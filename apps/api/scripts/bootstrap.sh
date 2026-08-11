#!/bin/sh
set -eu

echo "[bootstrap] waiting for database connection..."

node -e "
const { Client } = require('pg');

(async () => {
  const maxAttempts = 30;

  for (let i = 1; i <= maxAttempts; i++) {
    const client = new Client({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log('[bootstrap] database is ready');
      process.exit(0);
    } catch (err) {
      try { await client.end(); } catch (_) {}
      console.log('[bootstrap] database not ready yet, attempt ' + i + '/' + maxAttempts);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.error('[bootstrap] database did not become ready in time');
  process.exit(1);
})();
"

echo "[bootstrap] running migrations..."
npm run db:migrate

if [ "${BOOTSTRAP_SEED_IF_EMPTY:-true}" != "true" ]; then
  echo "[bootstrap] BOOTSTRAP_SEED_IF_EMPTY=false -> skipping seed"
  exit 0
fi

echo "[bootstrap] checking if rules table is empty..."

RULES_COUNT=$(node -e "
const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });

  try {
    await client.connect();
    const res = await client.query('SELECT COUNT(*)::int AS count FROM core.tb_regra');
    console.log(res.rows[0].count);
  } catch (err) {
    console.log('0');
  } finally {
    try { await client.end(); } catch (_) {}
  }
})();
")

echo "[bootstrap] core.tb_regra count = ${RULES_COUNT}"

if [ "${RULES_COUNT}" = "0" ]; then
  echo "[bootstrap] empty rules table -> running seed once"
  npm run db:seed
else
  echo "[bootstrap] rules already exist -> skipping seed"
fi

echo "[bootstrap] done"