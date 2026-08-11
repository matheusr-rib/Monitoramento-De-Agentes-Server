import { Op } from 'sequelize';
import { sequelize } from '@/db/sequelize';
import { DocumentoClicksign } from '@/models/DocumentoClicksign';
import { ClicksignClient } from '@/integrations/clicksign/ClicksignClient';
import type { TaskExecutionContext } from '@/services/TaskExecutor';

function onlyDigits(input: string) {
  return (input || '').replace(/\D+/g, '');
}


function normalizeFilename(input: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  const noAccents = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const upper = noAccents.toUpperCase();
  const cleaned = upper.replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  return cleaned || null;
}

function extractCpfCnpjFromFilename(filename: string | null): { cpf: string | null; cnpj: string | null } {
  if (!filename) return { cpf: null, cnpj: null };
  const s = filename;

  const cpfMatch =
    s.match(/(?<!\d)(\d{3}[\s.]?\d{3}[\s.]?\d{3}[-\s]?\d{2})(?!\d)/) ??
    s.match(/(?<!\d)(\d{11})(?!\d)/);

  const cnpjMatch =
    s.match(/(?<!\d)(\d{2}[\s.]?\d{3}[\s.]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})(?!\d)/) ??
    s.match(/(?<!\d)(\d{14})(?!\d)/);

  const cpf = cpfMatch ? onlyDigits(cpfMatch[1]) : null;
  const cnpj = cnpjMatch ? onlyDigits(cnpjMatch[1]) : null;

  return {
    cpf: cpf && cpf.length === 11 ? cpf : null,
    cnpj: cnpj && cnpj.length === 14 ? cnpj : null,
  };
}

async function upsertFromListItem(doc: any) {
  const key = doc?.key ?? doc?.document_key ?? doc?.uuid;
  if (!key) return false;

  // RAW para extração (não normalizar antes de extrair!)
  const filenameRaw: string | null = doc?.filename ?? null;

  // Extrai CPF/CNPJ do RAW (igual antes)
  const { cpf, cnpj } = extractCpfCnpjFromFilename(filenameRaw);

  // Salva NORMALIZADO no banco (para o LIKE da procedure funcionar)
  const filename = normalizeFilename(filenameRaw);

  // NOTE: preserva cd_agente no conflito (não atualiza cd_agente aqui)
  await sequelize.query(
    `
    INSERT INTO core.tb_documento_clicksign
      (clicksign_document_key, filename, status, folder_id, uploaded_at, updated_at, finished_at, deadline_at,
       cpf_extraido, cnpj_extraido, raw_payload, last_list_seen_at)
    VALUES
      (:key, :filename, :status, :folderId, :uploadedAt, :updatedAt, :finishedAt, :deadlineAt,
       :cpf, :cnpj, :rawPayload::jsonb, now())
    ON CONFLICT (clicksign_document_key)
    DO UPDATE SET
      filename = EXCLUDED.filename,
      status = EXCLUDED.status,
      folder_id = EXCLUDED.folder_id,
      uploaded_at = EXCLUDED.uploaded_at,
      updated_at = EXCLUDED.updated_at,
      finished_at = EXCLUDED.finished_at,
      deadline_at = EXCLUDED.deadline_at,
      cpf_extraido = EXCLUDED.cpf_extraido,
      cnpj_extraido = EXCLUDED.cnpj_extraido,
      raw_payload = EXCLUDED.raw_payload,
      last_list_seen_at = now()
    ;
    `,
    {
      replacements: {
        key,
        filename,
        status: doc?.status ?? null,
        folderId: doc?.folder_id ?? doc?.folderId ?? null,
        uploadedAt: doc?.uploaded_at ?? doc?.uploadedAt ?? null,
        updatedAt: doc?.updated_at ?? doc?.updatedAt ?? null,
        finishedAt: doc?.finished_at ?? doc?.finishedAt ?? null,
        deadlineAt: doc?.deadline_at ?? doc?.deadlineAt ?? null,
        cpf: cpf ? onlyDigits(cpf) : null,
        cnpj: cnpj ? onlyDigits(cnpj) : null,
        rawPayload: JSON.stringify(doc ?? {}),
      },
    }
  );

  return true;
}

async function upsertFromDetailPayload(payload: any) {
  const doc = payload?.document ?? payload;
  const key = doc?.key ?? doc?.document_key ?? doc?.uuid;
  if (!key) return false;

  // RAW para extração
  const filenameRaw: string | null = doc?.filename ?? null;

  // Extrai CPF/CNPJ do RAW
  const { cpf, cnpj } = extractCpfCnpjFromFilename(filenameRaw);

  // Salva NORMALIZADO (ou mantém o existente se vier null)
  const filename = normalizeFilename(filenameRaw);

  await sequelize.query(
    `
    UPDATE core.tb_documento_clicksign
       SET status = :status,
           updated_at = :updatedAt,
           finished_at = :finishedAt,
           deadline_at = :deadlineAt,
           filename = COALESCE(:filename, filename),
           folder_id = COALESCE(:folderId, folder_id),
           cpf_extraido = COALESCE(:cpf, cpf_extraido),
           cnpj_extraido = COALESCE(:cnpj, cnpj_extraido),
           raw_payload = :rawPayload::jsonb,
           last_list_seen_at = now()
     WHERE clicksign_document_key = :key::uuid
    ;
    `,
    {
      replacements: {
        key,
        filename,
        folderId: doc?.folder_id ?? doc?.folderId ?? null,
        status: doc?.status ?? null,
        updatedAt: doc?.updated_at ?? doc?.updatedAt ?? null,
        finishedAt: doc?.finished_at ?? doc?.finishedAt ?? null,
        deadlineAt: doc?.deadline_at ?? doc?.deadlineAt ?? null,
        cpf: cpf ? onlyDigits(cpf) : null,
        cnpj: cnpj ? onlyDigits(cnpj) : null,
        rawPayload: JSON.stringify(payload ?? {}),
      },
    }
  );

  return true;
}

async function setSyncState(fields: Record<string, any>) {
  const cols = Object.keys(fields);
  const setSql = cols.map((c) => `${c} = :${c}`).join(', ');

  await sequelize.query(
    `
    INSERT INTO public.sync_state (id, ${cols.join(', ')})
    VALUES (1, ${cols.map((c) => `:${c}`).join(', ')})
    ON CONFLICT (id) DO UPDATE SET ${setSql}
    `,
    { replacements: fields }
  );
}

async function getSyncState() {
  const [rows] = await sequelize.query(`SELECT * FROM public.sync_state WHERE id = 1`);
  return (rows as any[])[0] ?? null;
}

export type BackfillMode = 'BOOTSTRAP' | 'SYNC_OPEN';

export class ClicksignBackfillService {
  private client = new ClicksignClient();

  async run(mode: BackfillMode, params: any, ctx: TaskExecutionContext) {
    if (mode === 'BOOTSTRAP') return this.bootstrap(params, ctx);
    if (mode === 'SYNC_OPEN') return this.syncOpen(params, ctx);
    throw new Error(`Unknown mode: ${mode}`);
  }

  /**
   * BOOTSTRAP:
   * - varre TODAS as páginas do /documents (ordem antiga->nova)
   * - UPSERT por key
   * - grava sync_state.last_backfill_page e backfill_done
   */
  async bootstrap(params: { perPage?: number; resume?: boolean } = {}, ctx: TaskExecutionContext) {
    const perPage = Number(params.perPage || process.env.CLICKSIGN_PER_PAGE || 100);
    const resume = Boolean(params.resume);

    const state = await getSyncState();
    let page = 1;
    if (resume && state?.last_backfill_page) page = Number(state.last_backfill_page);

    await ctx.logInfo('Clicksign bootstrap start', { perPage, resume, startPage: page });

    let totalUpserted = 0;
    let lastTotalPages: number | null = null;

    while (true) {
      const data = await this.client.listDocuments(page, perPage);

      const docs = Array.isArray((data as any).documents) ? (data as any).documents : [];
      const totalPages = (data as any).total_pages ?? (data as any).totalPages ?? null;
      if (totalPages && !lastTotalPages) lastTotalPages = Number(totalPages);

      await ctx.logInfo('Fetched page', { page, docs: docs.length, totalPages: totalPages ?? undefined });

      if (!docs.length) break;

      // transação por página
      await sequelize.transaction(async () => {
        for (const d of docs) {
          const ok = await upsertFromListItem(d);
          if (ok) totalUpserted += 1;
        }
      });

      await setSyncState({ last_backfill_page: page, backfill_done: false, updated_at: new Date() });

      // se temos total_pages, respeita
      if (totalPages && page >= Number(totalPages)) break;

      page += 1;
    }

    await setSyncState({ backfill_done: true, updated_at: new Date() });
    await ctx.logOk('Clicksign bootstrap done', { totalUpserted, totalPages: lastTotalPages });

    ctx.setStat('docs_upserted', totalUpserted);
    ctx.setStat('mode', 'BOOTSTRAP');

    return { mode: 'BOOTSTRAP', docsUpserted: totalUpserted, totalPages: lastTotalPages };
  }

  /**
   * SYNC_OPEN:
   * - pega apenas documentos locais com status != 'closed'
   * - chama /documents/{key} (detalhe) e atualiza status/updated_at
   */
  async syncOpen(params: { batchSize?: number } = {}, ctx: TaskExecutionContext) {
    const batchSize = Number(params.batchSize || process.env.CLICKSIGN_SYNC_BATCH || 500);

    await ctx.logInfo('Clicksign sync-open start', { batchSize });

    const openDocs = await DocumentoClicksign.findAll({
      where: { status: { [Op.ne]: 'closed' } },
      attributes: ['clicksign_document_key', 'status'],
      limit: batchSize,
      order: [['updated_at', 'ASC']],
    });

    let updated = 0;
    let closedNow = 0;

    for (const row of openDocs as any[]) {
      const key = row.clicksign_document_key as string;
      const before = row.status;

      const payload = await this.client.getDocument(key);
      const ok = await upsertFromDetailPayload(payload);
      if (ok) updated += 1;

      const after = payload?.document?.status ?? payload?.status ?? null;
      if (before !== 'closed' && after === 'closed') closedNow += 1;

      if (updated % 50 === 0) {
        await ctx.logInfo('Sync progress', { updated, closedNow });
      }
    }

    await ctx.logOk('Clicksign sync-open done', { updated, closedNow });

    ctx.setStat('docs_checked', openDocs.length);
    ctx.setStat('docs_updated', updated);
    ctx.setStat('docs_closed_now', closedNow);
    ctx.setStat('mode', 'SYNC_OPEN');

    return { mode: 'SYNC_OPEN', docsChecked: openDocs.length, docsUpdated: updated, docsClosedNow: closedNow };
  }
}