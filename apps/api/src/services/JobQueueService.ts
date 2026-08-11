import { JobRunService } from '@/services/JobRunService';
import type { JobType } from '@/constants/jobTypes';

export class JobQueueService {
  static async enqueue(input: {
    jobType: JobType;
    requestedBy: string;
    inputFilename?: string | null;
    payload?: Record<string, unknown> | null;
  }) {
    const job = await JobRunService.enqueue({
      jobType: input.jobType,
      requestedBy: input.requestedBy,
      inputFilename: input.inputFilename ?? null,
      inputMeta: input.payload ?? null,
    });

    return { jobId: job.id_job_run };
  }
}
