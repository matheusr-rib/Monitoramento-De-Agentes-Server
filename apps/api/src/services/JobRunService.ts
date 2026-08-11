import { JobRun } from '@/models/JobRun';

export type JobRunStartInput = {
  jobType: string;
  requestedBy: string;
  inputFilename?: string | null;
  inputMeta?: Record<string, unknown> | null;
};

export type JobRunFinishInput = {
  stats?: Record<string, unknown> | null;
  error?: string | null;
};

export class JobRunService {

  static async enqueue(input: JobRunStartInput) {
    const job = await JobRun.create({
      job_type: input.jobType,
      status: 'QUEUED',
      requested_by: input.requestedBy,
      input_filename: input.inputFilename ?? null,
      input_meta: input.inputMeta ?? null,
      started_at: new Date(),
      finished_at: null,
      stats: null,
      error: null,
    } as any);

    return job;
  }

  static async markRunning(jobId: number, transaction?: any) {
    await JobRun.update(
      { status: 'RUNNING', started_at: new Date(), finished_at: null, error: null },
      { where: { id_job_run: jobId }, transaction }
    );
    return JobRun.findByPk(jobId);
  }


  static async start(input: JobRunStartInput) {
    const job = await JobRun.create({
      job_type: input.jobType,
      status: 'RUNNING',
      requested_by: input.requestedBy,
      input_filename: input.inputFilename ?? null,
      input_meta: input.inputMeta ?? null,
      started_at: new Date(),
      finished_at: null,
      stats: null,
      error: null,
    } as any);

    return job;
  }

  static async success(jobId: number, input: JobRunFinishInput = {}, transaction?: any) {
    await JobRun.update(
      {
        status: 'SUCCESS',
        finished_at: new Date(),
        stats: input.stats ?? null,
        error: null,
      },
      { where: { id_job_run: jobId }, transaction }
    );

    return JobRun.findByPk(jobId);
  }

  static async fail(jobId: number, input: JobRunFinishInput = {}, transaction?: any) {
    await JobRun.update(
      {
        status: 'FAILED',
        finished_at: new Date(),
        stats: input.stats ?? null,
        error: input.error ?? 'Unknown error',
      },
      { where: { id_job_run: jobId }, transaction }
    );

    return JobRun.findByPk(jobId);
  }

  static async getById(jobId: number) {
    return JobRun.findByPk(jobId);
  }

  static async list(limit = 50) {
    return JobRun.findAll({
      order: [['id_job_run', 'DESC']],
      limit,
    });
  }
}