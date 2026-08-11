import { BadRequestError } from '@lewe-negocios/api-core';
import { normalizeText, keyText } from '@/utils/normalize';
import { readTable } from '@/loaders/_file';
import { insertValuesBatched } from '@/loaders/_db';
import { toNone } from '@/loaders/_helpers';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

function parseIntLoose(x: unknown): number | null {
  const s = toNone(x);
  if (!s) return null;
  const d = String(s).replace(/\D+/g, '');
  if (!d) return null;
  const v = Number(d);
  return Number.isFinite(v) ? Math.trunc(v) : null;
}

type Stats = {
  rows_total: number;
  upserted: number;
};

export class ConvenioPrazoLoader {
  public readonly type = 'CONVENIO_PRAZO';

  async run(filePath: string, ctx: TaskExecutionContext): Promise<Stats> {
    const stats: Stats = { rows_total: 0, upserted: 0 };

    const rows = await readTable(filePath);
    if (!rows.length) throw new BadRequestError('EMPTY_FILE');
    stats.rows_total = rows.length;

    // Python: "Convênio" e "Prazo máximo" :contentReference[oaicite:12]{index=12}
    const required = ['Convênio', 'Prazo máximo'];
    const headers = Object.keys(rows[0] ?? {}).map((h) => String(h).trim());
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length) throw new BadRequestError(`MISSING_COLUMNS: ${missing.join(', ')}`);

    const parsed: Array<{ ds_convenio: string; ds_convenio_norm: string; nr_prazo_max: number }> = [];

    for (const rAny of rows as any[]) {
      const ds_convenio = normalizeText(rAny['Convênio'], { keepSpaces: true });
      const nr_prazo_max = parseIntLoose(rAny['Prazo máximo']);

      if (!ds_convenio || !nr_prazo_max || nr_prazo_max <= 0) continue;

      const ds_convenio_norm = (normalizeText(ds_convenio, { keepSpaces: true }) ?? '').replace(/ /g, '');
      if (!ds_convenio_norm) continue;

      parsed.push({ ds_convenio, ds_convenio_norm, nr_prazo_max });
    }

    // dedup por ds_convenio_norm (keep last)
    const dedup = new Map<string, { ds_convenio: string; ds_convenio_norm: string; nr_prazo_max: number }>();
    for (const p of parsed) dedup.set(p.ds_convenio_norm, p);
    const deduped = Array.from(dedup.values());

    if (deduped.length) {
      const sqlPrefix =
        'INSERT INTO core.tb_convenio_prazo (ds_convenio, ds_convenio_norm, nr_prazo_max) VALUES ';
      const suffix =
        ' ON CONFLICT (ds_convenio_norm) DO UPDATE SET ds_convenio = EXCLUDED.ds_convenio, nr_prazo_max = EXCLUDED.nr_prazo_max, dt_carga = NOW()';

      const values = deduped.map((p) => [p.ds_convenio, p.ds_convenio_norm, p.nr_prazo_max]);
      await insertValuesBatched(sqlPrefix, values, { pageSize: 5000, suffix } as any);
      stats.upserted = deduped.length;
    }

    for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
    return stats;
  }
}