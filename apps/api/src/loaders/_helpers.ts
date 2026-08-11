import xlsx from 'xlsx';
import { normalizeText } from '@/utils/normalize';

const NA_SET = new Set(['', 'nan', 'nat', 'none', 'null', '-']);

export function toNone(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (!s) return null;
  if (NA_SET.has(s.toLowerCase())) return null;
  return s;
}

export function parseDateExcelOrString(x: unknown, dayFirst: boolean): Date | null {
  if (x === null || x === undefined) return null;

  if (x instanceof Date && !Number.isNaN(x.getTime())) return x;

  // excel serial
  if (typeof x === 'number') {
    const d = xlsx.SSF.parse_date_code(x);
    if (!d) return null;
    const dt = new Date(d.y, (d.m || 1) - 1, d.d || 1, d.H || 0, d.M || 0, d.S || 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const s0 = toNone(x);
  if (!s0) return null;

  // tenta parse nativo
  const dtNative = new Date(s0);
  if (!Number.isNaN(dtNative.getTime())) return dtNative;

  // tenta dd/mm/yyyy
  const m = s0.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
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

  // fallback: se dayFirst=false, não arrisco inventar parse
  if (!dayFirst) return null;

  return null;
}

export function parseCdAgenteFlexible(x: unknown): number | null {
  const s = toNone(x);
  if (!s) return null;

  if (typeof x === 'number' && Number.isFinite(x)) {
    const v = Math.trunc(x);
    return Number.isSafeInteger(v) ? v : null;
  }

  if (typeof x === 'bigint') {
    const v = Number(x);
    return Number.isSafeInteger(v) ? v : null;
  }

  const d = s.replace(/\D+/g, '');
  if (!d) return null;
  const v = Number(d);
  return Number.isSafeInteger(v) ? v : null;
}

export function splitPropostas(val: unknown): Array<string | null> {
  const s = toNone(val);
  if (!s) return [null];

  const sNorm = normalizeText(s, { keepSpaces: true }) ?? '';
  if (sNorm === 'NAO INFORMADO' || sNorm === 'NAOINFORMADO') return [null];

  // se vier number tipo 30108421.0 no JS já pode virar string com .0
  if (typeof val === 'number' && Number.isFinite(val)) {
    return [String(Math.trunc(val)).slice(0, 30)];
  }

  const parts = String(s).split('/').map((p) => p.trim()).filter(Boolean);
  const out = parts.map((p) => p.slice(0, 30));
  return out.length ? out : [null];
}

/**
 * Igual ao Python do POSVENDA:
 * - se tiver "Sim/Não" => NAO
 * - detecta SIM/NAO em texto normalizado sem espaços/pontuação
 */
export function parseAnswerSimNao(val: unknown): 'SIM' | 'NAO' | null {
  const s = toNone(val);
  if (!s) return null;

  const n = normalizeText(s, { keepSpaces: false }) ?? '';
  const hasSim = n.includes('SIM');
  const hasNao = n.includes('NAO');

  if (hasSim && hasNao) return 'NAO';
  if (hasNao) return 'NAO';
  if (hasSim) return 'SIM';
  return null;
}