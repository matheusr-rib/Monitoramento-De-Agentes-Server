import fs from 'fs/promises';
import xlsx from 'xlsx';

export type ReadTableOptions = {
  sheetName?: string;
};

export async function readTable(path: string, opts: ReadTableOptions = {}): Promise<Record<string, unknown>[]> {
  const lower = path.toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const buf = await fs.readFile(path);
    const wb = xlsx.read(buf, { type: 'buffer' });
    const sheet = opts.sheetName ?? wb.SheetNames?.[0];
    if (!sheet) return [];
    const ws = wb.Sheets[sheet];
    const json = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
    return Array.isArray(json) ? json : [];
  }

  if (lower.endsWith('.csv')) {
    const buf = await fs.readFile(path);
    const wb = xlsx.read(buf, { type: 'buffer' });
    const sheet = wb.SheetNames?.[0];
    if (!sheet) return [];
    const ws = wb.Sheets[sheet];
    const json = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
    return Array.isArray(json) ? json : [];
  }

  throw new Error('Formato não suportado. Use .xlsx/.xls/.csv');
}