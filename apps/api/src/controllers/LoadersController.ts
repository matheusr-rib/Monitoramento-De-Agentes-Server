import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '@lewe-negocios/api-core';
import type { LoaderType } from '@/services/LoaderTypes';
import { JobQueueService } from '@/services/JobQueueService';
import { JOB_TYPES } from '@/constants/jobTypes';

export class LoadersController {
  async run(req: Request, res: Response, next: NextFunction) {
    try {
      const type = String(req.body?.type || '').trim().toUpperCase() as LoaderType;
      if (!type) throw new BadRequestError('INVALID_TYPE');

      const requestedBy =
        (req.body?.requestedBy as string | undefined) ??
        (req.headers['x-user'] as string | undefined) ??
        'system';

      const jobTypeByLoader: Record<string, string> = {
        AGENTES: JOB_TYPES.LOADER_AGENTES,
        ESTEIRA: JOB_TYPES.LOADER_ESTEIRA,
        FRAUDE: JOB_TYPES.LOADER_FRAUDE,
        POSVENDA: JOB_TYPES.LOADER_POSVENDA,
        AUTORREGULACAO: JOB_TYPES.LOADER_AUTORREGULACAO,
        CONVENIO_PRAZO: JOB_TYPES.LOADER_CONVENIO_PRAZO,
        NUVIDEO: JOB_TYPES.LOADER_NUVIDEO,
      };

      const jobType = jobTypeByLoader[type];
      if (!jobType) throw new BadRequestError(`JobType não mapeado para loader: ${type}`);

      // MODO 1: upload local (compatibilidade)
      const filePath = req.file?.path ?? null;
      const inputFilename = req.file?.originalname ?? null;

      // MODO 2: MinIO via fileKey
      const fileKey = String(req.body?.fileKey || '').trim();

      if (!filePath && !fileKey) throw new BadRequestError('NO_FILE_OR_FILEKEY');

      const payload =
        fileKey && !filePath
          ? { type, fileKey, source: 'S3', deleteAfter: true }
          : { type, filePath, source: 'LOCAL', deleteAfter: true };

      const inferredFilename =
        inputFilename ??
        (fileKey ? fileKey.split('/').pop() ?? null : null) ??
        null;

      const { jobId } = await JobQueueService.enqueue({
        jobType: jobType as any,
        requestedBy,
        inputFilename: inferredFilename,
        payload,
      });

      return res.status(201).json({ jobId: String(jobId) });
    } catch (err) {
      return next(err);
    }
  }
}