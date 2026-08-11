import { BadRequestError } from '@lewe-negocios/api-core';
import { QueryTypes } from 'sequelize';
import { normalizeText } from '@/utils/normalize';
import { readTable } from '@/loaders/_file';
import { db, insertValuesBatched } from '@/loaders/_db';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, '');
}

function normalizeCpfCnpjRobust(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw || ['nan', 'none', 'null'].includes(raw.toLowerCase())) return null;

  let s = raw.replace(',', '.');

  if (/[eE][+-]?\d+/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    s = String(Math.trunc(n));
  }

  const digits = digitsOnly(s);
  if (!digits) return null;
  if (digits.length > 14) return null;

  if (digits.length <= 11) return digits.padStart(11, '0');
  return digits.padStart(14, '0');
}

function asNumberStrict(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function parseDateLoose(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const s = String(value).trim();
  if (!s) return null;

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const HH = Number(m[4] ?? 0);
    const MM = Number(m[5] ?? 0);
    const SS = Number(m[6] ?? 0);
    const out = new Date(yy, mm - 1, dd, HH, MM, SS);
    return Number.isNaN(out.getTime()) ? null : out;
  }

  return null;
}

type AgentesLoaderOptions = {
  replaceAll?: boolean;
};

type AgentesLoaderStats = {
  rows_total: number;
  valid: number;
  invalid: number;
  inserted: number;
  updated: number;
  skipped: number;
  invalid_samples: Array<{ rowIndex: number; reason: string; raw: Record<string, unknown> }>;
};

const REQUIRED_HEADERS = ['ID_AGENTE', 'NOME_AGENTE', 'STATUS_AGENTE', 'CPF', 'DATA_CADASTRO'] as const;

export class AgentesLoader {
  public readonly type = 'AGENTES';

  async run(filePath: string, ctx: TaskExecutionContext, opts: AgentesLoaderOptions = {}): Promise<AgentesLoaderStats> {
    const replaceAll = Boolean(opts.replaceAll);

    const stats: AgentesLoaderStats = {
      rows_total: 0,
      valid: 0,
      invalid: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      invalid_samples: [],
    };

    const rows = await readTable(filePath);
    if (!rows.length) throw new BadRequestError('EMPTY_FILE');

    stats.rows_total = rows.length;

    const headers = Object.keys(rows[0] ?? {}).map((h) => String(h).trim());
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw new BadRequestError(`MISSING_COLUMNS: ${missing.join(', ')} | Found: ${headers.join(', ')}`);
    }

    type Parsed = { cd_agente: number; cpf_cnpj: string | null; nome: string; ds_status: string; dt_cadastro: Date };

    const parsed: Parsed[] = [];

    const invalidPush = (rowIndex: number, reason: string, raw: Record<string, unknown>) => {
      stats.invalid++;
      if (stats.invalid_samples.length < 30) stats.invalid_samples.push({ rowIndex, reason, raw });
    };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] ?? {};
      const rowIndex = i + 2; // header=1

      const cd_agente = asNumberStrict(r.ID_AGENTE);
      if (!cd_agente) {
        invalidPush(rowIndex, 'cd_agente inválido/ausente', r);
        continue;
      }

      const nome = normalizeText(r.NOME_AGENTE, { keepSpaces: true }) ?? '';
      if (!nome.trim()) {
        invalidPush(rowIndex, 'nome inválido/ausente', r);
        continue;
      }

      const ds_status = normalizeText(r.STATUS_AGENTE, { keepSpaces: true }) ?? '';
      if (!ds_status.trim()) {
        invalidPush(rowIndex, 'ds_status inválido/ausente', r);
        continue;
      }

      const dt_cadastro = parseDateLoose(r.DATA_CADASTRO) ?? new Date('1900-01-01T00:00:00.000Z');

      // aceita NULL se inválido (como você pediu)
      const cpfRaw = normalizeCpfCnpjRobust(r.CPF);
      const cpf_cnpj = cpfRaw && (cpfRaw.length === 11 || cpfRaw.length === 14) ? cpfRaw : null;

      parsed.push({ cd_agente, cpf_cnpj, nome, ds_status, dt_cadastro });
      stats.valid++;
    }

    if (!parsed.length) {
      stats.skipped = stats.rows_total;
      for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
      return stats;
    }

    // dedup por cd_agente, mantendo o mais recente por dt_cadastro (igual Python)
    parsed.sort((a, b) => a.dt_cadastro.getTime() - b.dt_cadastro.getTime());
    const dedup = new Map<number, Parsed>();
    for (const p of parsed) dedup.set(p.cd_agente, p);
    const deduped = Array.from(dedup.values());

    await db().transaction(async (t) => {
      if (replaceAll) {
        // modo Python (perigoso pra você)
        await db().query('TRUNCATE TABLE core.tb_agente RESTART IDENTITY CASCADE;', { transaction: t });
      }

      if (replaceAll) {
        // insere tudo (sem conflito, tabela vazia)
        const sqlPrefix =
          'INSERT INTO core.tb_agente (cd_agente, cpf_cnpj, nome, ds_status, dt_atualizacao) VALUES ';
        const now = new Date();
        const values = deduped.map((p) => [p.cd_agente, p.cpf_cnpj, p.nome, p.ds_status, now]);
        await insertValuesBatched(sqlPrefix, values, { pageSize: 5000 });
        stats.inserted = deduped.length;
        stats.updated = 0;
        return;
      }

      // ✅ modo “só novos”: só insere cd_agente que ainda não existe
      const cds = deduped.map((d) => d.cd_agente);
      const existingRows = await db().query<{ cd_agente: number }>(
        'SELECT cd_agente FROM core.tb_agente WHERE cd_agente = ANY($1::bigint[]);',
        { bind: [cds], type: QueryTypes.SELECT, transaction: t } as any,
      );

      const exists = new Set((Array.isArray(existingRows) ? existingRows : []).map((x) => Number(x.cd_agente)));
      const onlyNew = deduped.filter((p) => !exists.has(p.cd_agente));

      const now = new Date();
      const sqlPrefix =
        'INSERT INTO core.tb_agente (cd_agente, cpf_cnpj, nome, ds_status, dt_atualizacao) VALUES ';

      const values = onlyNew.map((p) => [p.cd_agente, p.cpf_cnpj, p.nome, p.ds_status, now]);
      await insertValuesBatched(sqlPrefix, values, { pageSize: 5000 });

      stats.inserted = onlyNew.length;
      stats.updated = 0;
    });

    stats.skipped = stats.rows_total - stats.valid - stats.invalid;
    for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
    return stats;
  }
}