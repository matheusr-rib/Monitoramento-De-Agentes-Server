import { Op } from 'sequelize';
import { JobRunLog, JobRunLogLevel } from '@/models/JobRunLog';

export class JobRunLogService {
  static async append(
    jobId: number,
    level: JobRunLogLevel,
    message: string,
    meta: Record<string, unknown> | null = null
  ): Promise<void> {
    await JobRunLog.create({
      id_job_run: jobId,
      level,
      message,
      meta,
      created_at: new Date(),
    } as any);
  }

  static async list(jobId: number, limit = 500, afterId?: number) {
    const where: any = { id_job_run: jobId };
    if (afterId) where.id_job_run_log = { [Op.gt]: afterId };

    return JobRunLog.findAll({
      where,
      order: [['id_job_run_log', 'ASC']],
      limit,
    });
  }
}
