import { sequelize } from '@/db/sequelize';
import { JobRunService } from '@/services/JobRunService';
import { JobRunLogService } from '@/services/JobRunLogService';
import { JobHandlers } from '@/services/JobHandlers';
import type { TaskExecutionContext } from '@/services/TaskExecutor';
import { ClicksignBackfillService } from '@/services/ClicksignBackfillService';

type WorkerOptions = {
  pollIntervalMs: number;
};

// singleton: evita recriar serviço a cada job
const clicksignBackfillServiceSingleton = new ClicksignBackfillService();

export class JobWorker {
  private static started = false;
  private static opts: WorkerOptions = { pollIntervalMs: Number(process.env.JOB_WORKER_POLL_MS || 1000) };

  static start(opts?: Partial<WorkerOptions>) {
    if (this.started) return;
    this.started = true;
    this.opts = { ...this.opts, ...(opts ?? {}) };

    // fire-and-forget loop in same process
    void this.loop();
  }

  private static async loop() {
    while (true) {
      try {
        const job = await this.claimNextJob();
        if (!job) {
          await new Promise((r) => setTimeout(r, this.opts.pollIntervalMs));
          continue;
        }

        await this.executeJob(job.id_job_run, job.job_type, job.requested_by, job.input_filename, job.input_meta);
      } catch (err) {
        // evita crashar o processo por erro do worker
        console.error('JobWorker loop error', err);
        await new Promise((r) => setTimeout(r, this.opts.pollIntervalMs));
      }
    }
  }

  private static async claimNextJob(): Promise<any | null> {
    return sequelize.transaction(async (t) => {
      // pega 1 job em fila, bloqueia linha (skip locked)
      const [rows] = await sequelize.query(
        `
        SELECT *
          FROM core.tb_job_run
         WHERE status = 'QUEUED'
         ORDER BY id_job_run ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
        `,
        { transaction: t }
      );

      const job = (rows as any[])[0];
      if (!job) return null;

      // lock por tipo (evita concorrência do mesmo job_type)
      const [lockRows] = await sequelize.query(`SELECT pg_try_advisory_lock(hashtext(:k)) as ok`, {
        replacements: { k: String(job.job_type) },
        transaction: t,
      });
      const ok = Boolean((lockRows as any[])[0]?.ok);
      if (!ok) {
        // não pega; deixa queued
        return null;
      }

      await JobRunService.markRunning(Number(job.id_job_run), t);

      return job;
    });
  }

  private static async executeJob(
    jobId: number,
    jobType: string,
    requestedBy: string,
    inputFilename: string | null,
    inputMeta: any
  ) {
    const startedAt = Date.now();

    const ctx: TaskExecutionContext = {
      jobId,
      jobType,
      requestedBy,
      inputFilename,
      inputMeta,
      stats: {},
      setStat: (k: string, v: any) => {
        (ctx.stats as any)[k] = v;
      },

      // logs
      logInfo: async (m: string, meta?: any) => JobRunLogService.append(jobId, 'INFO', m, meta ?? null),
      logWarn: async (m: string, meta?: any) => JobRunLogService.append(jobId, 'WARN', m, meta ?? null),
      logError: async (m: string, meta?: any) => JobRunLogService.append(jobId, 'ERROR', m, meta ?? null),
      logOk: async (m: string, meta?: any) => JobRunLogService.append(jobId, 'OK', m, meta ?? null),

      // ✅ adiciona services p/ compatibilidade (evita undefined em código legado)
      services: {
        backfillService: clicksignBackfillServiceSingleton,
      },
    } as any;

    await ctx.logInfo('Job started', { jobType });

    try {
      const handler = JobHandlers.get(jobType as any);
      const result = await handler(ctx, inputMeta);

      ctx.setStat('duration_ms', Date.now() - startedAt);

      await JobRunService.success(jobId, { stats: ctx.stats });
      await ctx.logOk('Job success', { jobType });

      return result;
    } catch (err: any) {
      ctx.setStat('duration_ms', Date.now() - startedAt);
      const message = typeof err?.message === 'string' ? err.message : 'Job failed';
      const stack = typeof err?.stack === 'string' ? err.stack : null;

      await JobRunService.fail(jobId, { stats: ctx.stats, error: message });
      await ctx.logError('Job failed', { jobType, error: message, stack });

      return null;
    } finally {
      // sempre unlock advisory
      try {
        await sequelize.query(`SELECT pg_advisory_unlock(hashtext(:k))`, { replacements: { k: String(jobType) } });
      } catch {}
    }
  }
}