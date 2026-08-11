import { JobRunService } from '@/services/JobRunService';
import { JobRunLogService } from '@/services/JobRunLogService';

export type TaskExecutionContext = {
  jobId: number;
  jobType: string;
  requestedBy: string;
  inputFilename: string | null;
  inputMeta: Record<string, unknown> | null;
  stats: Record<string, unknown>;
  setStat: (key: string, value: unknown) => void;
  logInfo: (message: string, meta?: Record<string, unknown>) => Promise<void>;
  logWarn: (message: string, meta?: Record<string, unknown>) => Promise<void>;
  logError: (message: string, meta?: Record<string, unknown>) => Promise<void>;
  logOk: (message: string, meta?: Record<string, unknown>) => Promise<void>;
  services?: {
    backfillService?: unknown;
  };
};

export type RunTaskInput = {
  jobType: string;
  requestedBy: string;
  inputFilename?: string | null;
  inputMeta?: Record<string, unknown> | null;
};

export class TaskExecutor {
  static async run<T>(
    input: RunTaskInput,
    task: (ctx: TaskExecutionContext) => Promise<T>
  ): Promise<{ jobId: number; result: T }> {
    const startedAt = Date.now();

    const job = await JobRunService.start({
      jobType: input.jobType,
      requestedBy: input.requestedBy,
      inputFilename: input.inputFilename ?? null,
      inputMeta: input.inputMeta ?? null,
    });

    const stats: Record<string, unknown> = {};

    const ctx: TaskExecutionContext = {
      jobId: job.id_job_run,
      jobType: input.jobType,
      requestedBy: input.requestedBy,
      inputFilename: input.inputFilename ?? null,
      inputMeta: (input.inputMeta ?? null) as Record<string, unknown> | null,
      stats,
      setStat: (key, value) => {
        stats[key] = value;
      },
      logInfo: async (message, meta) =>
        JobRunLogService.append(job.id_job_run, 'INFO', message, meta ?? null),
      logWarn: async (message, meta) =>
        JobRunLogService.append(job.id_job_run, 'WARN', message, meta ?? null),
      logError: async (message, meta) =>
        JobRunLogService.append(job.id_job_run, 'ERROR', message, meta ?? null),
      logOk: async (message, meta) =>
        JobRunLogService.append(job.id_job_run, 'OK', message, meta ?? null),
    };



    try {
      const result = await task(ctx);

      ctx.setStat('duration_ms', Date.now() - startedAt);

      await JobRunService.success(job.id_job_run, { stats: ctx.stats });

      return { jobId: job.id_job_run, result };
    } catch (err: any) {
      ctx.setStat('duration_ms', Date.now() - startedAt);

      const message =
        typeof err?.message === 'string' ? err.message : 'Task failed';

      await JobRunService.fail(job.id_job_run, {
        stats: ctx.stats,
        error: message,
      });

      // propaga o erro pro controller decidir o HTTP code
      throw err;
    }
  }
}