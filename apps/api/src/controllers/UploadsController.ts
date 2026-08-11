import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '@lewe-negocios/api-core';
import crypto from 'crypto';
import path from 'path';
import { S3StorageService } from '@/services/S3StorageService';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function requiredString(v: any, field: string): string {
  const s = String(v ?? '').trim();
  if (!s) throw new BadRequestError(`MISSING_${field.toUpperCase()}`);
  return s;
}

export class UploadsController {
  constructor(private readonly s3 = new S3StorageService()) {}

  async presign(req: Request, res: Response, next: NextFunction) {
    try {
      const filename = requiredString(req.body?.filename, 'filename');
      const contentType = requiredString(req.body?.contentType, 'contentType');
      const size = Number(req.body?.size ?? 0);

      // Limites defensivos (ajuste se quiser)
      if (!Number.isFinite(size) || size <= 0) throw new BadRequestError('INVALID_SIZE');
      if (size > 30 * 1024 * 1024) throw new BadRequestError('FILE_TOO_LARGE'); // 30MB

      // valida extensão
      const ext = path.extname(filename).toLowerCase().replace('.', '');
      const allowed = new Set(['xlsx', 'xls', 'csv']);
      if (!allowed.has(ext)) throw new BadRequestError('INVALID_FILE_EXT');

      const bucket = process.env.S3_BUCKET || 'loaders';

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');

      const id = crypto.randomUUID();
      const safe = sanitizeFilename(filename);
      const key = `raw/${yyyy}-${mm}-${dd}/${id}_${safe}`;

      const { url, requiredHeaders } = await this.s3.presignPut({
        bucket,
        key,
        contentType,
        expiresInSeconds: 600,
      });

      return res.status(200).json({
        bucket,
        fileKey: key,
        uploadUrl: url,
        requiredHeaders,
        expiresInSeconds: 600,
      });
    } catch (err) {
      return next(err);
    }
  }

  async confirm(req: Request, res: Response, next: NextFunction) {
    try {
      const fileKey = requiredString(req.body?.fileKey, 'fileKey');
      const bucket = process.env.S3_BUCKET || 'loaders';

      const ok = await this.s3.exists(bucket, fileKey);
      if (!ok) throw new BadRequestError('FILE_NOT_FOUND_IN_STORAGE');

      return res.status(200).json({ ok: true });
    } catch (err) {
      return next(err);
    }
  }
}