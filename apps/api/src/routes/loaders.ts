import { Router } from 'express';
import { uploaderMiddleware } from '@lewe-negocios/api-core';
import { LoadersController } from '@/controllers/LoadersController';

const router = Router();

const uploader = uploaderMiddleware({
  tempDir: '/tmp/uploads',
  allowedExts: ['xlsx', 'xls', 'csv'],
  maxFileSize: 30 * 1024 * 1024,
  required: false,
});

const controller = new LoadersController();

router.post('/run', uploader.single('file', { required: false }), (req, res, next) =>
  controller.run(req, res, next),
);

export default router;