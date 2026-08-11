import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '@lewe-negocios/api-core';
import { JobQueueService } from '@/services/JobQueueService';
import { JOB_TYPES } from '@/constants/jobTypes';

export class ClicksignController {
  /**
   * POST /api/v1/clicksign/backfill
   * body: { mode?: 'BOOTSTRAP'|'SYNC_OPEN', params?: {...}, requestedBy?: string }
   */
  static async backfill(req: Request, res: Response, next: NextFunction) {
    try {
      const mode = (req.body?.mode as string | undefined) ?? 'SYNC_OPEN';
      if (!['BOOTSTRAP', 'SYNC_OPEN'].includes(mode)) throw new BadRequestError('INVALID_MODE');

      const requestedBy =
        (req.body?.requestedBy as string | undefined) ??
        (req.headers['x-user'] as string | undefined) ??
        'system';

      const params = (req.body?.params as any) ?? {};

      const { jobId } = await JobQueueService.enqueue({
        jobType: JOB_TYPES.BACKFILL,
        requestedBy,
        payload: { mode, params },
      });

      return res.status(201).json({ jobId: String(jobId) });
    } catch (err) {
      return next(err);
    }
  }
}
