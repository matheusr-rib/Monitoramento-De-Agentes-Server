import { QueryTypes, Sequelize, Transaction } from 'sequelize';

import { sequelize } from '@/db/sequelize';

export function db(): Sequelize {
  return sequelize;
}

export async function fetchAgentesExistentes(): Promise<Set<number>> {
  const rows = await db().query<{ cd_agente: number }>('SELECT cd_agente FROM core.tb_agente;', {
    type: QueryTypes.SELECT,
  });
  return new Set(rows.map((r) => Number(r.cd_agente)));
}

type BatchInsertOptions = {
  pageSize?: number;
  suffix?: string; // ex: ' ON CONFLICT DO NOTHING' ou ' ON CONFLICT (...) DO UPDATE ...'
  transaction?: Transaction;
};

/**
 * INSERT em batches com bind $1..$N.
 * Você passa:
 * - sqlPrefix: 'INSERT INTO ... (a,b) VALUES '
 * - rows: [[a1,b1],[a2,b2],...]
 * - suffix: opcional (ON CONFLICT etc.)
 */
export async function insertValuesBatched(
  sqlPrefix: string,
  rows: unknown[][],
  opts: BatchInsertOptions = {},
): Promise<void> {
  const pageSize = opts.pageSize ?? 5000;
  const suffix = opts.suffix ?? '';
  const transaction = opts.transaction;

  if (!rows.length) return;

  for (let i = 0; i < rows.length; i += pageSize) {
    const batch = rows.slice(i, i + pageSize);

    const binds: unknown[] = [];
    let bindIdx = 1;

    const valuesSql = batch
      .map((r) => {
        const placeholders = r.map(() => `$${bindIdx++}`);
        binds.push(...r);
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');

    const sql = `${sqlPrefix}${valuesSql}${suffix}`;
    await db().query(sql, { bind: binds, transaction });
  }
}