import fs from 'fs/promises';
import xlsx from 'xlsx';
import { BadRequestError } from '@lewe-negocios/api-core';
import { QueryTypes, Transaction } from 'sequelize';
import { db, insertValuesBatched, fetchAgentesExistentes } from '@/loaders/_db';
import { normalizeLoaderHeader, normalizeText, keyText } from '@/utils/normalize';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

const DEFAULT_SHEET_NAME = 'PAGAMENTO DE SALDO';

const H_DATA = 'DATA';
const H_PARCEIRO = 'PARCEIRO';
const H_CONVENIO = 'CONVENIO';
const H_PROPOSTA = 'PROPOSTA';
const H_PCR = 'PCR';

const PRAZO_MIN = 0;
const PRAZO_MAX = 1000;
const BIGINT_MAX = 9_223_372_036_854_775_807n;

const PRAZO_KEY_DEFAULT = -1;
const PROPOSTA_KEY_DEFAULT = '__SEM_PROPOSTA__';

function cleanExcelHeader(x: unknown): string {
  return String(x ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNone(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).replace(/\u00A0/g, ' ').trim();
  if (!s) return null;
  const l = s.toLowerCase();
  if (l === 'nan' || l === 'nat' || l === 'none' || l === 'null' || l === '-') return null;
  return s;
}

function parseDtEvent(x: unknown): Date | null {
  if (x instanceof Date && !Number.isNaN(x.getTime())) return x;

  if (typeof x === 'number' && Number.isFinite(x)) {
    const d = xlsx.SSF.parse_date_code(x);
    if (!d) return null;
    const dt = new Date(d.y, (d.m || 1) - 1, d.d || 1, d.H || 0, d.M || 0, d.S || 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const s = toNone(x);
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

function parseCdAgente(x: unknown): number | null {
  const s = toNone(x);
  if (!s) return null;

  if (typeof x === 'number' && Number.isFinite(x)) {
    const v = Math.trunc(x);
    return Number.isSafeInteger(v) && v > 0 ? v : null;
  }

  const d = s.replace(/\D+/g, '');
  if (!d) return null;
  const v = Number(d);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

function parsePrazoPcr(x: unknown): number | null {
  if (x === null || x === undefined) return null;

  if (typeof x === 'number' && Number.isFinite(x)) {
    const v = Math.trunc(x);
    if (v < PRAZO_MIN || v > PRAZO_MAX) return null;
    return v;
  }

  const s = toNone(x);
  if (!s) return null;

  const s2 = s.replace(',', '.');
  const asFloat = Number(s2);
  if (Number.isFinite(asFloat)) {
    const v = Math.trunc(asFloat);
    if (v < PRAZO_MIN || v > PRAZO_MAX) return null;
    return v;
  }

  const d = s.replace(/\D+/g, '');
  if (!d) return null;
  const v = Number(d);
  if (!Number.isFinite(v)) return null;
  const vi = Math.trunc(v);
  if (vi < PRAZO_MIN || vi > PRAZO_MAX) return null;
  return vi;
}

function splitPropostas(val: unknown): Array<string | null> {
  const s = toNone(val);
  if (!s) return [null];

  const sNorm = normalizeText(s, { keepSpaces: true }) ?? '';
  if (sNorm === 'NAO INFORMADO' || sNorm === 'NAOINFORMADO') return [null];

  const parts = String(s)
    .split('/')
    .map((p) => p.replace(/\u00A0/g, ' ').trim())
    .filter(Boolean);

  if (!parts.length) return [null];
  return parts.map((p) => p.slice(0, 30));
}

function pickHeaderMap(headers: string[]): Record<string, string> {
  const canonToReal: Record<string, string> = {};
  for (const h of headers) {
    const hClean = cleanExcelHeader(h);
    const canon = normalizeLoaderHeader(hClean);
    if (!canon) continue;
    canonToReal[canon] = h;
  }

  const required = [H_DATA, H_PARCEIRO, H_CONVENIO, H_PROPOSTA, H_PCR] as const;
  const out: Record<string, string> = {};
  for (const c of required) {
    const real = canonToReal[c];
    if (real) out[c] = real;
  }
  return out;
}

async function insertWithDebug(
  t: Transaction,
  sqlPrefix: string,
  rows: unknown[][],
  suffix: string,
  pageSize = 5000,
): Promise<{ affectedApprox: number; badRows: Array<{ row: unknown[]; error: string }> }> {
  let affectedApprox = 0;
  const badRows: Array<{ row: unknown[]; error: string }> = [];

  for (let i = 0; i < rows.length; i += pageSize) {
    const batch = rows.slice(i, i + pageSize);

    await db().query('SAVEPOINT sp_batch', { transaction: t });
    try {
      await insertValuesBatched(sqlPrefix, batch, { pageSize: batch.length, suffix, transaction: t });
      affectedApprox += batch.length;
      await db().query('RELEASE SAVEPOINT sp_batch', { transaction: t });
    } catch (eBatch: any) {
      await db().query('ROLLBACK TO SAVEPOINT sp_batch', { transaction: t });
      await db().query('RELEASE SAVEPOINT sp_batch', { transaction: t });

      for (const r of batch) {
        await db().query('SAVEPOINT sp_row', { transaction: t });
        try {
          await insertValuesBatched(sqlPrefix, [r], { pageSize: 1, suffix, transaction: t });
          affectedApprox += 1;
          await db().query('RELEASE SAVEPOINT sp_row', { transaction: t });
        } catch (eRow: any) {
          await db().query('ROLLBACK TO SAVEPOINT sp_row', { transaction: t });
          await db().query('RELEASE SAVEPOINT sp_row', { transaction: t });
          badRows.push({ row: r, error: String(eRow?.message ?? eRow) });
          if (badRows.length >= 200) break;
        }
      }
    }

    if (badRows.length >= 200) break;
  }

  return { affectedApprox, badRows };
}

type AutorregStats = {
  sheet_used: string;
  rows_total: number;
  ocorrencias_geradas: number;
  aptas_fk: number;
  ignoradas_fk: number;
  convenio_sem_prazo_max: number;
  prazo_invalido: number;
  inserted_approx: number;
  bad_rows: number;
  samples_agente_inexistente: Array<any>;
  samples_prazo_invalido: Array<any>;
  samples_insert_error: Array<any>;
};

export class AutorregulacaoLoader {
  public readonly type = 'AUTORREGULACAO';

  async run(filePath: string, ctx: TaskExecutionContext): Promise<AutorregStats> {
    const stats: AutorregStats = {
      sheet_used: '',
      rows_total: 0,
      ocorrencias_geradas: 0,
      aptas_fk: 0,
      ignoradas_fk: 0,
      convenio_sem_prazo_max: 0,
      prazo_invalido: 0,
      inserted_approx: 0,
      bad_rows: 0,
      samples_agente_inexistente: [],
      samples_prazo_invalido: [],
      samples_insert_error: [],
    };

    const buffer = await fs.readFile(filePath);
    const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true });

    if (!wb.SheetNames?.length) {
      throw new BadRequestError('Arquivo inválido: não há planilhas.');
    }

    const sheetName = wb.SheetNames.includes(DEFAULT_SHEET_NAME)
      ? DEFAULT_SHEET_NAME
      : wb.SheetNames[4];

    stats.sheet_used = sheetName;

    const ws = wb.Sheets[sheetName];
    const json = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });

    if (!Array.isArray(json) || json.length === 0) {
      throw new BadRequestError(`Planilha "${sheetName}" está vazia.`);
    }

    stats.rows_total = json.length;

    const headers = Object.keys(json[0] ?? {});
    const headerMap = pickHeaderMap(headers);

    const requiredCanon = [H_DATA, H_PARCEIRO, H_CONVENIO, H_PROPOSTA, H_PCR] as const;
    const missing = requiredCanon.filter((c) => !headerMap[c]);

    if (missing.length) {
      const avail = headers.join(', ');
      const sheets = wb.SheetNames.join(', ');
      throw new BadRequestError(
        `Colunas obrigatórias ausentes na planilha "${sheetName}": ${missing.join(
          ', ',
        )}. Colunas encontradas: ${avail}. Planilhas disponíveis no arquivo: ${sheets}.`,
      );
    }

    const convenioRows = await db().query<{ ds_convenio_norm: string; nr_prazo_max: number }>(
      'SELECT ds_convenio_norm, nr_prazo_max FROM core.tb_convenio_prazo;',
      { type: QueryTypes.SELECT },
    );

    const convenioPrazoMax = new Map<string, number>();
    for (const r of convenioRows) {
      if (r.ds_convenio_norm) convenioPrazoMax.set(String(r.ds_convenio_norm), Number(r.nr_prazo_max));
    }

    const agentesExistentes = await fetchAgentesExistentes();

    const rowsOk: unknown[][] = [];
    const prazoInvalidoSamples: any[] = [];
    const agenteInexistenteSamples: any[] = [];

    const dtCargaNow = new Date();

    for (let i = 0; i < json.length; i++) {
      const row = json[i] ?? {};
      const linhaOrigem = i + 2;

      const dt_evento = parseDtEvent(row[headerMap[H_DATA]]);
      if (!dt_evento) continue;

      const cd_agente = parseCdAgente(row[headerMap[H_PARCEIRO]]);
      if (!cd_agente) continue;

      if (BigInt(cd_agente) <= 0n || BigInt(cd_agente) > BIGINT_MAX) continue;

      const convenioTxt = normalizeText(row[headerMap[H_CONVENIO]], { keepSpaces: true });
      if (!convenioTxt) continue;

      const convenioNorm = keyText(convenioTxt) ?? '';
      const prazoRaw = row[headerMap[H_PCR]];
      const prazo = parsePrazoPcr(prazoRaw);

      if (toNone(prazoRaw) !== null && prazo === null) {
        stats.prazo_invalido++;
        if (prazoInvalidoSamples.length < 30) {
          prazoInvalidoSamples.push({
            linha_origem: linhaOrigem,
            cd_agente,
            dt_evento: dt_evento.toISOString(),
            convenio: convenioTxt,
            pcr_raw: String(prazoRaw),
            proposta_raw: String(row[headerMap[H_PROPOSTA]]),
          });
        }
      }

      let houveViolacao = false;
      const prazoMax = convenioPrazoMax.get(convenioNorm);

      if (prazoMax === undefined) {
        stats.convenio_sem_prazo_max++;
      } else {
        if (prazo !== null && prazo + 12 > prazoMax) houveViolacao = true;
      }

      // chave NOT NULL para índice/UPSERT
      const prazo_key = prazo === null ? PRAZO_KEY_DEFAULT : prazo;

      for (const prop of splitPropostas(row[headerMap[H_PROPOSTA]])) {
        const nr_proposta = prop ? String(prop).slice(0, 30) : null;

        // chave NOT NULL para índice/UPSERT
        const nr_proposta_key = nr_proposta ?? PROPOSTA_KEY_DEFAULT;

        const rec: unknown[] = [
          cd_agente,
          dt_evento,
          convenioTxt,
          prazo,
          prazo_key,
          Boolean(houveViolacao),
          dtCargaNow,
          nr_proposta,
          nr_proposta_key,
        ];

        stats.ocorrencias_geradas++;

        if (agentesExistentes.has(cd_agente)) {
          rowsOk.push(rec);
        } else {
          stats.ignoradas_fk++;
          if (agenteInexistenteSamples.length < 30) {
            agenteInexistenteSamples.push({
              linha_origem: linhaOrigem,
              cd_agente,
              dt_evento: dt_evento.toISOString(),
              convenio: convenioTxt,
              prazo,
              prazo_key,
              houve_violacao: houveViolacao,
              nr_proposta,
              nr_proposta_key,
            });
          }
        }
      }
    }

    stats.aptas_fk = rowsOk.length;
    stats.samples_prazo_invalido = prazoInvalidoSamples;
    stats.samples_agente_inexistente = agenteInexistenteSamples;

    if (!rowsOk.length) {
      for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
      return stats;
    }

    const sqlPrefix =
      'INSERT INTO core.tb_autorregulacao (cd_agente, dt_evento, convenio, prazo, prazo_key, houve_violacao, dt_carga, nr_proposta, nr_proposta_key) VALUES ';

    const suffix = `
      ON CONFLICT (cd_agente, dt_evento, convenio, prazo_key, nr_proposta_key)
      DO UPDATE SET
        houve_violacao   = EXCLUDED.houve_violacao,
        prazo            = EXCLUDED.prazo,
        nr_proposta      = EXCLUDED.nr_proposta,
        dt_carga         = GREATEST(core.tb_autorregulacao.dt_carga, EXCLUDED.dt_carga)
    `
      .replace(/\s+/g, ' ')
      .trim();

    const result = await db().transaction(async (t) => {
      return await insertWithDebug(t, sqlPrefix, rowsOk, ` ${suffix}`, 5000);
    });

    stats.inserted_approx = result.affectedApprox;
    stats.bad_rows = result.badRows.length;

    if (result.badRows.length) {
      stats.samples_insert_error = result.badRows.slice(0, 30).map((br) => ({
        cd_agente: br.row[0],
        dt_evento: String((br.row[1] as Date)?.toISOString?.() ?? br.row[1]),
        convenio: br.row[2],
        prazo: br.row[3],
        prazo_key: br.row[4],
        houve_violacao: br.row[5],
        dt_carga: String((br.row[6] as Date)?.toISOString?.() ?? br.row[6]),
        nr_proposta: br.row[7],
        nr_proposta_key: br.row[8],
        erro: br.error,
      }));
    }

    for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
    return stats;
  }
}