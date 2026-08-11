import { BadRequestError } from '@lewe-negocios/api-core';
import { normalizeText } from '@/utils/normalize';
import { readTable } from '@/loaders/_file';
import { db, fetchAgentesExistentes, insertValuesBatched } from '@/loaders/_db';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

type Stats = {
  rows_total: number;
  valid: number;
  invalid: number;
  inserted: number;
  ignored_sem_agente: number;
};

export class EsteiraLoader {
  public readonly type = 'ESTEIRA';

  async run(filePath: string, ctx: TaskExecutionContext): Promise<Stats> {
    const stats: Stats = { rows_total: 0, valid: 0, invalid: 0, inserted: 0, ignored_sem_agente: 0 };

    const rows = await readTable(filePath);
    if (!rows.length) throw new BadRequestError('EMPTY_FILE');

    stats.rows_total = rows.length;

    const headers = Object.keys(rows[0] ?? {}).map((h) => String(h).trim());
    const missing = ['ID_AGENTE', 'ESTEIRA_SUGERIDA'].filter((h) => !headers.includes(h));
    if (missing.length) throw new BadRequestError(`MISSING_COLUMNS: ${missing.join(', ')}`);

    const parsed: Array<{ cd_agente: number; ds_esteira: string }> = [];

    for (const r of rows) {
      const cdTxt = String((r as any).ID_AGENTE ?? '').trim();
      if (!/^\d+$/.test(cdTxt)) {
        stats.invalid++;
        continue;
      }

      const cd_agente = Number(cdTxt);
      if (!Number.isSafeInteger(cd_agente)) {
        stats.invalid++;
        continue;
      }

      const ds = normalizeText((r as any).ESTEIRA_SUGERIDA, { keepSpaces: true }) ?? '';
      if (!ds.trim()) {
        stats.invalid++;
        continue;
      }

      parsed.push({ cd_agente, ds_esteira: ds.slice(0, 20) });
      stats.valid++;
    }

    // 1 esteira por agente (keep last)
    const dedup = new Map<number, { cd_agente: number; ds_esteira: string }>();
    for (const p of parsed) dedup.set(p.cd_agente, p);
    const deduped = Array.from(dedup.values());

    const agentesExist = await fetchAgentesExistentes();
    const ok = deduped.filter((x) => agentesExist.has(x.cd_agente));
    const bad = deduped.filter((x) => !agentesExist.has(x.cd_agente));

    stats.ignored_sem_agente = bad.length;

    await db().transaction(async (t) => {
      await db().query('TRUNCATE TABLE core.tb_esteira RESTART IDENTITY;', { transaction: t });

      if (ok.length) {
        const sqlPrefix = 'INSERT INTO core.tb_esteira (cd_agente, ds_esteira) VALUES ';
        const values = ok.map((x) => [x.cd_agente, x.ds_esteira]);

        // ✅ CRÍTICO: usar a MESMA transaction do TRUNCATE (evita lock/espera infinita)
        await insertValuesBatched(sqlPrefix, values, { pageSize: 5000, transaction: t });

        stats.inserted = ok.length;
      }
    });

    for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
    return stats;
  }
}