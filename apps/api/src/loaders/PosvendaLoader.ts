import { BadRequestError } from '@lewe-negocios/api-core';
import { readTable } from '@/loaders/_file';
import { insertValuesBatched } from '@/loaders/_db';
import {
  parseAnswerSimNao,
  parseDateExcelOrString,
  splitPropostas,
  parseCdAgenteFlexible,
} from '@/loaders/_helpers';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

type Stats = {
  rows_total: number;
  ocorrencias_geradas: number;
  attempted: number;
};

export class PosvendaLoader {
  public readonly type = 'POSVENDA';

  async run(filePath: string, ctx: TaskExecutionContext): Promise<Stats> {
    const stats: Stats = {
      rows_total: 0,
      ocorrencias_geradas: 0,
      attempted: 0,
    };

    await ctx.logInfo('POSVENDA loader started', { filePath });

    const rows = await readTable(filePath, { sheetName: '2026' });
    if (!rows.length) {
      await ctx.logError('POSVENDA empty file', { filePath, sheetName: '2026' });
      throw new BadRequestError('EMPTY_FILE');
    }

    stats.rows_total = rows.length;

    await ctx.logInfo('POSVENDA file loaded', {
      filePath,
      sheetName: '2026',
      rows_total: stats.rows_total,
    });

    const required = [
      'ID AGENTE',
      'DATA CTR',
      'PROPOSTA',
      'RECONHECE OPERAÇÃO ?',
      'COMPREENDEU O PRODUTO ?',
      'HOUVE PROMESSA INDEVIDA ?',
      'HOUVE COBRANÇA DE TAXA ?',
    ];

    const headers = Object.keys(rows[0] ?? {}).map((h) => String(h).trim());
    const missing = required.filter((h) => !headers.includes(h));

    if (missing.length) {
      await ctx.logError('POSVENDA missing required columns', {
        missing,
        headers,
      });
      throw new BadRequestError(`MISSING_COLUMNS: ${missing.join(', ')}`);
    }

    const inserts: unknown[][] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r: any = rows[i];

      const cd_agente = parseCdAgenteFlexible(r['ID AGENTE']);
      if (!cd_agente) continue;

      const dt = parseDateExcelOrString(r['DATA CTR'], true);
      if (!dt) continue;

      const propostas = splitPropostas(r['PROPOSTA']);

      const q1 = parseAnswerSimNao(r['RECONHECE OPERAÇÃO ?']);
      const q2 = parseAnswerSimNao(r['COMPREENDEU O PRODUTO ?']);
      const q3 = parseAnswerSimNao(r['HOUVE PROMESSA INDEVIDA ?']);
      const q4 = parseAnswerSimNao(r['HOUVE COBRANÇA DE TAXA ?']);

      const motivos: string[] = [];
      if (q1 === 'NAO') motivos.push('RECONHECE_OPERACAO_NAO');
      if (q2 === 'NAO') motivos.push('COMPREENDEU_PRODUTO_NAO');
      if (q3 === 'SIM') motivos.push('PROMESSA_INDEVIDA_SIM');
      if (q4 === 'SIM') motivos.push('COBRANCA_TAXA_SIM');

      if (!motivos.length) continue;

      for (const p of propostas) {
        const nr_proposta = p ?? null;

        for (const ds_motivo of motivos) {
          const dedupKey = [
            String(cd_agente),
            dt.toISOString(),
            'POSVENDA',
            ds_motivo ?? '__SEM_MOTIVO__',
            nr_proposta ?? '__SEM_PROPOSTA__',
          ].join('|');

          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);

          inserts.push([cd_agente, dt, 'POSVENDA', ds_motivo, nr_proposta]);
          stats.ocorrencias_geradas++;
        }
      }
    }

    stats.attempted = inserts.length;

    await ctx.logInfo('POSVENDA occurrences generated', {
      rows_total: stats.rows_total,
      ocorrencias_geradas: stats.ocorrencias_geradas,
      attempted: stats.attempted,
    });

    if (inserts.length) {
      const sqlPrefix =
        'INSERT INTO core.tb_posvenda (cd_agente, dt_evento, ds_resultado, ds_motivo, nr_proposta) VALUES ';

      try {
        await insertValuesBatched(sqlPrefix, inserts, {
          pageSize: 5000,
          suffix: ' ON CONFLICT DO NOTHING',
        });

        await ctx.logOk('POSVENDA insert finished', {
          attempted: stats.attempted,
        });
      } catch (err: any) {
        await ctx.logError('POSVENDA insert failed', {
          attempted: stats.attempted,
          sample: inserts[0] ?? null,
          error: String(err?.message || err),
        });
        throw err;
      }
    } else {
      await ctx.logWarn('POSVENDA no insert rows generated', {
        rows_total: stats.rows_total,
      });
    }

    for (const [k, v] of Object.entries(stats)) {
      ctx.setStat(k, v);
    }

    return stats;
  }
}