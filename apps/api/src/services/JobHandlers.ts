import fs from 'fs/promises';
import path from 'path';

import { LoaderService } from '@/services/LoaderService';
import type { LoaderType } from '@/services/LoaderTypes';
import { ClicksignBackfillService, BackfillMode } from '@/services/ClicksignBackfillService';
import { ProceduresService } from '@/services/ProceduresService';
import type { TaskExecutionContext } from '@/services/TaskExecutor';
import { JOB_TYPES, JobType } from '@/constants/jobTypes';
import { S3StorageService } from '@/services/S3StorageService';

export type JobHandler = (ctx: TaskExecutionContext, inputMeta: any) => Promise<any>;

function parseLoaderType(value: unknown): LoaderType {
  const t = String(value ?? '').toUpperCase();
  const allowed: LoaderType[] = [
    'AGENTES',
    'ESTEIRA',
    'FRAUDE',
    'POSVENDA',
    'AUTORREGULACAO',
    'NUVIDEO',
    'CONVENIO_PRAZO',
  ];
  if (!allowed.includes(t as LoaderType)) {
    throw new Error(`Invalid loader type: ${t}`);
  }
  return t as LoaderType;
}

export class JobHandlers {
  private static loaderService = new LoaderService();
  private static backfillService = new ClicksignBackfillService();
  private static s3 = new S3StorageService();

  static get(jobType: JobType): JobHandler {
    switch (jobType) {
      case JOB_TYPES.LOADER_AGENTES:
      case JOB_TYPES.LOADER_ESTEIRA:
      case JOB_TYPES.LOADER_FRAUDE:
      case JOB_TYPES.LOADER_POSVENDA:
      case JOB_TYPES.LOADER_AUTORREGULACAO:
      case JOB_TYPES.LOADER_CONVENIO_PRAZO:
      case JOB_TYPES.LOADER_NUVIDEO:
        return JobHandlers.runLoader;

      case JOB_TYPES.BACKFILL:
        return JobHandlers.runBackfill;

      case JOB_TYPES.PROC_MATCH:
        return JobHandlers.runProcMatch;

      case JOB_TYPES.PROC_SCORE:
        return JobHandlers.runProcScore;

      case JOB_TYPES.LOADER_TEST_PING:
        return async (ctx) => {
          await ctx.logInfo('Ping started');
          await new Promise((r) => setTimeout(r, 250));
          await ctx.logOk('Ping done');
          return { ok: true };
        };

      default:
        throw new Error(`No handler for jobType: ${jobType}`);
    }
  }

  /**
   * Loader payload suportado:
   * - LOCAL: { type, filePath, deleteAfter }
   * - S3/MinIO: { type, fileKey, deleteAfter }
   */
  private static async runLoader(ctx: TaskExecutionContext, meta: any) {
    const bucket = process.env.S3_BUCKET || 'loaders';

    const { type, filePath, fileKey, deleteAfter } = meta ?? {};
    if (!type) throw new Error('Missing loader payload: { type }');

    let effectivePath: string | null = filePath ? String(filePath) : null;

    // Se vier fileKey (MinIO), baixa para /tmp e usa caminho local
    if (!effectivePath && fileKey) {
      const key = String(fileKey);
      const filename = key.split('/').pop() || `upload_${ctx.jobId}.dat`;
      const dest = path.join('/tmp/loader-inputs', `${ctx.jobId}_${filename}`);

      await ctx.logInfo('Downloading input from S3/MinIO', { bucket, key, dest });
      await JobHandlers.s3.downloadToFile(bucket, key, dest);
      await ctx.logInfo('Downloaded input', { dest });

      effectivePath = dest;
    }

    if (!effectivePath) {
      throw new Error('Missing loader payload: { filePath | fileKey }');
    }

    await ctx.logInfo('Loader start', { type, filePath: effectivePath });

    const result = await JobHandlers.loaderService.run(parseLoaderType(type), effectivePath, ctx);

    await ctx.logOk('Loader finished', { type });

    if (deleteAfter) {
      try {
        await fs.unlink(effectivePath);
        await ctx.logInfo('Deleted temp file', { filePath: effectivePath });
      } catch (e: any) {
        await ctx.logWarn('Failed to delete temp file', { filePath: effectivePath, error: String(e?.message || e) });
      }
    }

    return result;
  }

  private static async runBackfill(ctx: TaskExecutionContext, meta: any) {
    const mode = (meta?.mode as BackfillMode | undefined) ?? 'SYNC_OPEN';
    const params = meta?.params ?? {};
    await ctx.logInfo('Backfill start', { mode, params });

    // garante services sem acessar "this"
    const anyCtx = ctx as any;
    anyCtx.services = anyCtx.services ?? {};
    anyCtx.services.backfillService = anyCtx.services.backfillService ?? JobHandlers.backfillService;

    return JobHandlers.backfillService.run(mode, params, ctx);
  }

  private static async runProcMatch(ctx: TaskExecutionContext) {
    return ProceduresService.matchClicksign(ctx);
  }

  private static async runProcScore(ctx: TaskExecutionContext, meta: any) {
    const dtInicio = meta?.dtInicio;
    const dtFim = meta?.dtFim;
    return ProceduresService.calcularScorePeriodo({ dtInicio, dtFim }, ctx);
  }
}