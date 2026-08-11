import { BadRequestError } from '@lewe-negocios/api-core';
import { normalizeText } from '@/utils/normalize';
import { readTable } from '@/loaders/_file';
import { fetchAgentesExistentes, insertValuesBatched } from '@/loaders/_db';
import { parseDateExcelOrString, splitPropostas, toNone, parseCdAgenteFlexible } from '@/loaders/_helpers';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

type Stats = {
  rows_total: number;
  ocorrencias_geradas: number;
  aptas_fk: number;
  ignoradas_fk: number;
  attempted: number;
};

export class FraudeLoader {
  public readonly type = 'FRAUDE';

  async run(filePath: string, ctx: TaskExecutionContext): Promise<Stats> {
    const stats: Stats = { rows_total: 0, ocorrencias_geradas: 0, aptas_fk: 0, ignoradas_fk: 0, attempted: 0 };

    const rows = await readTable(filePath);
    if (!rows.length) throw new BadRequestError('EMPTY_FILE');
    stats.rows_total = rows.length;

    const required = ['COD', 'MOTIVO', 'DATA', 'PROPOSTA'];
    const headers = Object.keys(rows[0] ?? {}).map((h) => String(h).trim());
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length) throw new BadRequestError(`MISSING_COLUMNS: ${missing.join(', ')}`);

    const agentes = await fetchAgentesExistentes();

    const ok: unknown[][] = [];
    let badFk = 0;

    for (const rAny of rows as any[]) {
      const dt = parseDateExcelOrString(rAny.DATA, true);
      if (!dt) continue;

      const ds_motivo = normalizeText(rAny.MOTIVO, { keepSpaces: true });
      if (!ds_motivo) continue;

      const cd = parseCdAgenteFlexible(rAny.COD);
      if (!cd) continue;

      for (const p of splitPropostas(rAny.PROPOSTA)) {
        const rec: unknown[] = [cd, dt, ds_motivo, p ?? null];
        stats.ocorrencias_geradas++;

        if (agentes.has(cd)) ok.push(rec);
        else badFk++;
      }
    }

    stats.aptas_fk = ok.length;
    stats.ignoradas_fk = badFk;
    stats.attempted = ok.length;

    if (ok.length) {
      const sqlPrefix = 'INSERT INTO core.tb_fraude (cd_agente, dt_evento, ds_motivo, nr_proposta) VALUES ';
      await insertValuesBatched(sqlPrefix, ok, { pageSize: 5000, suffix: ' ON CONFLICT DO NOTHING' } as any);
    }

    for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
    return stats;
  }
}