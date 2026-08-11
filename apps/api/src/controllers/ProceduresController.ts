import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '@lewe-negocios/api-core';
import { JobQueueService } from '@/services/JobQueueService';
import { JOB_TYPES } from '@/constants/jobTypes';

export class ProceduresController {
  /**
   * POST /api/v1/procedures/match-clicksign
   */
  static async matchClicksign(req: Request, res: Response, next: NextFunction) {
    try {
      const requestedBy =
        (req.body?.requestedBy as string | undefined) ??
        (req.headers['x-user'] as string | undefined) ??
        'system';

      const { jobId } = await JobQueueService.enqueue({
        jobType: JOB_TYPES.PROC_MATCH,
        requestedBy,
        payload: null,
      });

      return res.status(201).json({ jobId: String(jobId) });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * POST /api/v1/procedures/calc-score
   * body: { dtInicio: 'YYYY-MM-DD', dtFim: 'YYYY-MM-DD' }
   */
  static async calcScore(req: Request, res: Response, next: NextFunction) {
    try {
      const dtInicio = String(req.body?.dtInicio || '').trim();
      const dtFim = String(req.body?.dtFim || '').trim();
      if (!dtInicio || !dtFim) throw new BadRequestError('INVALID_DATE_RANGE');

      const requestedBy =
        (req.body?.requestedBy as string | undefined) ??
        (req.headers['x-user'] as string | undefined) ??
        'system';

      const { jobId } = await JobQueueService.enqueue({
        jobType: JOB_TYPES.PROC_SCORE,
        requestedBy,
        payload: { dtInicio, dtFim },
      });

      return res.status(201).json({ jobId: String(jobId) });
    } catch (err) {
      return next(err);
    }
  }
}
