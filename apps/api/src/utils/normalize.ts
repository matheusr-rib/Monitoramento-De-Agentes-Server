const NA_SET = new Set(['', 'nan', 'nat', 'none', 'null', '-']);

export function isBlank(x: unknown): boolean {
  if (x === null || x === undefined) return true;
  const s = String(x).trim();
  return s === '' || NA_SET.has(s.toLowerCase());
}

export function toStrOrNone(x: unknown): string | null {
  if (isBlank(x)) return null;
  return String(x).trim();
}

export function onlyDigits(x: unknown, keepNone = true): string | null {
  const s = toStrOrNone(x);
  if (s === null) return keepNone ? null : '';
  const d = s.replace(/\D+/g, '');
  if (!d) return keepNone ? null : '';
  return d;
}

/**
 * Normaliza whitespace problemático que vem do Excel:
 * - NBSP (\u00A0) vira espaço normal
 * - compacta espaços/whitespaces
 */
function normalizeWeirdSpaces(s: string): string {
  return s
    .replace(/\u00A0/g, ' ') // NBSP -> espaço normal
    .replace(/\s+/g, ' ')    // compacta qualquer whitespace
    .trim();
}

export function stripAccents(x: unknown): string {
  const s0 = (x ?? '').toString();
  const s = normalizeWeirdSpaces(s0);
  return s
    .normalize('NFKD')
    .replace(/\p{Diacritic}+/gu, '');
}

export type NormalizeTextOptions = {
  upper?: boolean;
  removeAccents?: boolean;
  removeSpecial?: boolean;
  keepSpaces?: boolean;
  compactSpaces?: boolean;
};

export function normalizeText(x: unknown, opts: NormalizeTextOptions = {}): string | null {
  const {
    upper = true,
    removeAccents = true,
    removeSpecial = true,
    keepSpaces = true,
    compactSpaces = true,
  } = opts;

  let s = toStrOrNone(x);
  if (s === null) return null;

  // ⚠️ Correção principal: limpa NBSP e compacta whitespace logo no início
  s = normalizeWeirdSpaces(s);

  if (removeAccents) s = stripAccents(s);
  if (upper) s = s.toUpperCase();

  if (removeSpecial) {
    if (keepSpaces) {
      // mantém espaço normal como separador
      s = s.replace(/[^A-Z0-9 ]+/g, ' ');
    } else {
      s = s.replace(/[^A-Z0-9]+/g, '');
    }
  }

  if (compactSpaces && keepSpaces) {
    // reforça compactação após remoção de especiais
    s = normalizeWeirdSpaces(s);
  } else {
    s = s.trim();
  }

  return s || null;
}

/**
 * Normalização "human-friendly" (mantém espaços).
 * Ex: "DATA_CADASTRO" -> "DATA CADASTRO"
 */
export function normalizeHeader(x: unknown): string | null {
  return normalizeText(x, {
    upper: true,
    removeAccents: true,
    removeSpecial: true,
    keepSpaces: true,
    compactSpaces: true,
  });
}

/**
 * Normalização específica para headers de loaders (machine-friendly, padrão CORE).
 * Objetivo: aceitar Excel com "ID AGENTE" e também "ID_AGENTE", mas internamente
 * trabalhar com canonical "ID_AGENTE".
 *
 * Ex:
 *  - "ID AGENTE" -> "ID_AGENTE"
 *  - "ID_AGENTE" -> "ID_AGENTE"
 *  - "Data Cadastro" -> "DATA_CADASTRO"
 */
export function normalizeLoaderHeader(x: unknown): string | null {
  const h = normalizeHeader(x);
  if (!h) return null;

  // h já vem com whitespace normalizado, mas reforça por segurança
  const hh = normalizeWeirdSpaces(h);

  return (
    hh
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || null
  );
}

export function normalizeCpfCnpj(x: unknown): string | null {
  const d = onlyDigits(x, true);
  if (!d) return null;
  return d; // intencional: não valida DV; regra de tamanho será aplicada no uso
}

export function keyText(x: unknown): string | null {
  return normalizeText(x, {
    upper: true,
    removeAccents: true,
    removeSpecial: true,
    keepSpaces: false,
    compactSpaces: false,
  });
}

export function normalizeConvenio(x: unknown): string | null {
  return normalizeText(x, { keepSpaces: true });
}

export function normalizeFilename(x: unknown): string | null {
  return normalizeText(x, { keepSpaces: true });
}

export function extractCpfCnpjFromFilename(x: unknown): { cpf: string | null; cnpj: string | null } {
  if (x === null || x === undefined) return { cpf: null, cnpj: null };
  const s = String(x);

  const cpfMatches = s.match(/(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g) ?? [];
  const cnpjMatches = s.match(/(?<!\d)(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})(?!\d)/g) ?? [];

  const toDigits = (v: string) => v.replace(/\D+/g, '');

  let cpf = cpfMatches.length && cpfMatches[0] ? toDigits(cpfMatches[0]) : null;
  let cnpj = cnpjMatches.length && cnpjMatches[0] ? toDigits(cnpjMatches[0]) : null;

  if (cpf !== null && cpf.length !== 11) cpf = null;
  if (cnpj !== null && cnpj.length !== 14) cnpj = null;

  return { cpf, cnpj };
}