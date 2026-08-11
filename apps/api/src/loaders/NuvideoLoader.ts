import { BadRequestError } from '@lewe-negocios/api-core';
import { QueryTypes } from 'sequelize';
import { db, insertValuesBatched, fetchAgentesExistentes } from '@/loaders/_db';
import { readTable } from '@/loaders/_file';
import { normalizeText } from '@/utils/normalize';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

const TAG_COL = 'Tags';
const DATE_COL = 'Data de entrada (Formatado)';

// mesmas variações do Python
const PROPOSTA_COL_CANDIDATES = [
  'numero-de-proposta',
  'numero-da-proposta-',
  'Numero de proposta',
  'NUMERO DA PROPOSTA ',
  'NUMERO DA PROPOSTA',
  'NÚMERO DA PROPOSTA',
  'NUMERO DE PROPOSTA',
  'PROPOSTA',
  'Proposta',
];

function toNone(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (!s) return null;
  const l = s.toLowerCase();
  if (l === 'nan' || l === 'nat' || l === 'none' || l === 'null' || l === '-') return null;
  return s;
}

function normCacheKey(s: string): string {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function onlyDigitsKeepAlnum(x: unknown): string | null {
  const s = toNone(x);
  if (!s) return null;
  // Python: só normaliza espaços, não destrói alfanum
  return s.replace(/\s+/g, ' ').trim() || null;
}

function detectPropostaCols(headers: string[]): string[] {
  const colsNorm = new Map<string, string>(); // normalized -> real
  for (const c of headers) colsNorm.set(String(c).trim().toLowerCase().replace(/\s+/g, ' '), c);

  const out: string[] = [];
  for (const cand of PROPOSTA_COL_CANDIDATES) {
    const k = String(cand).trim().toLowerCase().replace(/\s+/g, ' ');
    const real = colsNorm.get(k);
    if (real) out.push(real);
  }

  // uniq mantendo ordem
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const c of out) {
    if (!seen.has(c)) {
      uniq.push(c);
      seen.add(c);
    }
  }
  return uniq;
}

function getPropostaFromRow(row: Record<string, unknown>, propostaCols: string[]): string | null {
  for (const c of propostaCols) {
    const v = onlyDigitsKeepAlnum(row[c]);
    if (v) return v;
  }
  return null;
}

function splitTags(raw: unknown): string[] {
  const s = toNone(raw);
  if (!s) return [];
  return String(s)
    .split(/[;,|/]+/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseDtEvento(x: unknown): Date | null {
  // Python: dayfirst=True, tolerante
  if (x instanceof Date && !Number.isNaN(x.getTime())) return x;

  const s = toNone(x);
  if (!s) return null;

  // tenta dd/mm/yyyy HH:mm:ss
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

  // fallback Date nativo
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt;

  return null;
}

type WorkbankOptions = {
  baseUrl: string;
  timeoutMs: number;
};

class WorkbankClient {
  private baseUrl: string;
  private timeoutMs: number;
  public readonly cache = new Map<string, string | null>(); // proposal_key -> cd_agente (string) ou null

  constructor(opts: WorkbankOptions) {
    if (!opts.baseUrl) throw new Error('WORKBANK_API_URL não definido no .env');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs;
  }

  private static parseCdAgente(agenteRaw: unknown): string | null {
    if (!agenteRaw) return null;
    const text = String(agenteRaw).trim();
    const m = text.match(/\((\d+)\)\s*$/);
    if (!m) return null;
    return m[1] ?? null;
  }

  async getCdAgenteByProposta(proposta: string): Promise<string | null> {
    const key = normCacheKey(proposta);
    if (this.cache.has(key)) return this.cache.get(key) ?? null;

    const url = new URL(`${this.baseUrl}/proposta`);
    url.searchParams.set('proposal', proposta);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(url.toString(), { method: 'GET', signal: controller.signal });
      if (!resp.ok) {
        this.cache.set(key, null);
        return null;
      }

      const data: unknown = await resp.json();
      if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object' || data[0] === null) {
        this.cache.set(key, null);
        return null;
      }

      const raw = data[0] as Record<string, unknown>;
      const agenteRaw = raw['agente'];
      const cd = WorkbankClient.parseCdAgente(agenteRaw);
      this.cache.set(key, cd);
      return cd;
    } catch {
      this.cache.set(key, null);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

type NuvideoStats = {
  rows_total: number;
  propostas_consultadas_cache: number;
  registros_gerados: number;
  inserted_approx: number;
  sem_agente_api: number;
  agente_inexistente: number;
  samples_sem_agente_api: Array<any>;
  samples_agente_inexistente: Array<any>;
};

export class NuvideoLoader {
  public readonly type = 'NUVIDEO';

  async run(filePath: string, ctx: TaskExecutionContext): Promise<NuvideoStats> {
    const stats: NuvideoStats = {
      rows_total: 0,
      propostas_consultadas_cache: 0,
      registros_gerados: 0,
      inserted_approx: 0,
      sem_agente_api: 0,
      agente_inexistente: 0,
      samples_sem_agente_api: [],
      samples_agente_inexistente: [],
    };

    const rows = await readTable(filePath);
    if (!rows.length) throw new BadRequestError('EMPTY_FILE');

    stats.rows_total = rows.length;

    const headers = Object.keys(rows[0] ?? {}).map((h) => String(h));
    if (!headers.includes(TAG_COL)) {
      throw new BadRequestError(`MISSING_COLUMNS: ${TAG_COL}`);
    }
    if (!headers.includes(DATE_COL)) {
      throw new BadRequestError(`MISSING_COLUMNS: ${DATE_COL}`);
    }

    const propostaCols = detectPropostaCols(headers);
    if (!propostaCols.length) {
      throw new BadRequestError(`NO_PROPOSTA_COLUMN_FOUND | Candidates=${PROPOSTA_COL_CANDIDATES.join(', ')}`);
    }

    const baseUrl = String(process.env.WORKBANK_API_URL ?? '').trim();
    const timeoutS = Number(process.env.WORKBANK_TIMEOUT_SECONDS ?? '50');
    const wb = new WorkbankClient({
      baseUrl,
      timeoutMs: Number.isFinite(timeoutS) ? Math.trunc(timeoutS * 1000) : 50_000,
    });

    const agentesExistentes = await fetchAgentesExistentes();

    const rowsOk: unknown[][] = [];
    const semAgenteApiSamples: any[] = [];
    const agenteInexistenteSamples: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? {};
      const linhaOrigem = i + 2;

      const proposta = getPropostaFromRow(row, propostaCols);
      if (!proposta) continue;

      const dt_evento = parseDtEvento(row[DATE_COL]);
      if (!dt_evento) continue;

      const tagsRaw = splitTags(row[TAG_COL]);
      if (!tagsRaw.length) continue;

      const tags: string[] = [];
      for (const t of tagsRaw) {
        const tn = normalizeText(t, { keepSpaces: true });
        if (tn) tags.push(tn);
      }
      if (!tags.length) continue;

      const cdAgenteTxt = await wb.getCdAgenteByProposta(proposta);
      if (!cdAgenteTxt || !/^\d+$/.test(cdAgenteTxt)) {
        stats.sem_agente_api++;
        if (semAgenteApiSamples.length < 30) {
          semAgenteApiSamples.push({
            linha_origem: linhaOrigem,
            proposta,
            dt_evento: dt_evento.toISOString(),
            tags_raw: toNone(row[TAG_COL]),
          });
        }
        continue;
      }

      const cd_agente = Number(cdAgenteTxt);
      if (!agentesExistentes.has(cd_agente)) {
        stats.agente_inexistente++;
        if (agenteInexistenteSamples.length < 30) {
          agenteInexistenteSamples.push({
            linha_origem: linhaOrigem,
            proposta,
            cd_agente_api: cd_agente,
            dt_evento: dt_evento.toISOString(),
            tags_raw: toNone(row[TAG_COL]),
          });
        }
        continue;
      }

      for (const tag of tags) {
        const nr_protocolo = proposta.slice(0, 50);
        rowsOk.push([cd_agente, dt_evento, tag, nr_protocolo]);
        stats.registros_gerados++;
      }
    }

    stats.propostas_consultadas_cache = wb.cache.size;
    stats.samples_sem_agente_api = semAgenteApiSamples;
    stats.samples_agente_inexistente = agenteInexistenteSamples;

    if (!rowsOk.length) {
      for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
      return stats;
    }

    const sqlPrefix = 'INSERT INTO core.tb_nuvideo (cd_agente, dt_evento, ds_tag, nr_protocolo) VALUES ';
    await insertValuesBatched(sqlPrefix, rowsOk, { pageSize: 5000, suffix: ' ON CONFLICT DO NOTHING' });

    stats.inserted_approx = rowsOk.length;

    for (const [k, v] of Object.entries(stats)) ctx.setStat(k, v);
    return stats;
  }
}